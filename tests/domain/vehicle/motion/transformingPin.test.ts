import fc from "fast-check";
import { expect, it } from "vitest";
import { clamp, localOffset } from "../../../../src/domain/shared/vec";
import type { TickContext } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { guardEnds } from "../../../../src/domain/vehicle/kinds/camper/bodyGuard";
import {
  CAMPER_MOTION,
  CAMPER_TYRES,
} from "../../../../src/domain/vehicle/kinds/camper/profile";
import {
  CAMPER_SPEC,
  CAMPER_TRANSFORMING,
} from "../../../../src/domain/vehicle/kinds/camper/spec";
import { SuvDrive } from "../../../../src/domain/vehicle/kinds/suv/drive";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { bankSink, stepBank } from "../../../../src/domain/vehicle/motion/bank";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";
import {
  climbInput,
  type Form,
  type FormState,
  initialForm,
  stepForm,
  verticalImpulse,
  verticalSpeed,
} from "../../../../src/domain/vehicle/motion/forms";
import type {
  MotionLimits,
  TyreLimits,
} from "../../../../src/domain/vehicle/motion/limits";
import {
  type GroundInput,
  initialMotion,
  type MotionResult,
  type MotionState,
  type StepProbe,
  stepMediumMotion,
  stepMotion,
} from "../../../../src/domain/vehicle/motion/motion";
import { stepHeight } from "../../../../src/domain/vehicle/motion/stepUp";
import { submarineVerticalSpeed } from "../../../../src/domain/vehicle/motion/submarine";
import type { TransformingSpec } from "../../../../src/domain/vehicle/motion/transforming";
import {
  groundInputFor,
  type StepGuard,
  TransformingDrive,
} from "../../../../src/domain/vehicle/motion/transformingDrive";
import { waterDepthAt } from "../../../../src/domain/vehicle/motion/water";
import { waterDepth, waterSensors } from "../../../support/waterDepth";

function stepProbe(
  ctx: TickContext,
  spec: TransformingSpec,
  drop = 0,
): StepProbe {
  return (f, speed) =>
    stepHeight(
      (ahead, side, dy) => {
        const o = localOffset(f, ahead, side);
        return ctx.solidAt({ x: o.x, y: dy - drop, z: o.z });
      },
      speed,
      { front: spec.hitboxFront, height: spec.carHeight },
    );
}

interface ReferenceStep {
  readonly speed: number;
  readonly yaw: number;
  readonly form: Form;
  readonly bank: number;
  readonly impulse: { x: number; y: number; z: number };
  readonly forward: { x: number; z: number };
  readonly riders: { thirdPerson: boolean; underwater: boolean };
}

// Today's TransformingDrive wiring, kept as an oracle (ADR 0089 style). Do not change it in this PR.
class ReferenceDrive {
  private motion: MotionState;
  private formState: FormState;
  private bank = 0;

  constructor(
    yaw: number,
    private readonly spec: TransformingSpec,
    private readonly limits: MotionLimits,
    private readonly tyres: TyreLimits,
    private readonly guard?: StepGuard,
  ) {
    this.motion = initialMotion(yaw);
    this.formState = initialForm("car");
  }

  step(raw: RawInput | undefined, ctx: TickContext): ReferenceStep {
    const controlled = raw !== undefined || ctx.awaitingDriver === true;
    const waterDepth = waterDepthAt(
      ctx.location,
      ctx.waterAt,
      this.spec.carHeight,
    );
    const form = this.advanceForm(raw, ctx, controlled, waterDepth);
    const input = groundInputFor(raw, form);
    const yawBefore = this.motion.yaw;
    const step = this.moveHorizontally(input, ctx, form);
    this.bank = stepBank(
      this.bank,
      form,
      yawBefore,
      step.state.yaw,
      this.limits.turnRate,
      this.spec,
    );
    const impulseY = this.verticalImpulseFor(
      form,
      raw,
      input,
      step,
      ctx,
      controlled,
      waterDepth,
    );
    this.motion = step.state;
    return {
      speed: this.motion.speed,
      yaw: this.motion.yaw,
      form,
      bank: this.bank,
      impulse: { x: step.impulse.x, y: impulseY, z: step.impulse.z },
      forward: step.forward,
      riders: { thirdPerson: form !== "car", underwater: form === "submarine" },
    };
  }

  private advanceForm(
    raw: RawInput | undefined,
    ctx: TickContext,
    controlled: boolean,
    waterDepth: number,
  ): Form {
    this.formState = stepForm(
      this.formState,
      {
        tick: ctx.tick,
        jump: raw?.jump ?? false,
        controlled,
        onGround: ctx.onGround,
        waterDepth,
      },
      this.spec,
    );
    return this.formState.form;
  }

  private moveHorizontally(
    input: GroundInput,
    ctx: TickContext,
    form: Form,
  ): MotionResult {
    const velocity = { x: ctx.velocity.x, z: ctx.velocity.z };
    const moved: MotionResult =
      form === "car"
        ? stepMotion(
            this.motion,
            input,
            { velocity, onGround: ctx.onGround },
            stepProbe(ctx, this.spec),
            this.limits,
            this.tyres,
          )
        : stepMediumMotion(
            this.motion,
            input,
            velocity,
            form === "submarine" ? this.spec.water : this.spec.air,
            this.limits,
            this.tyres.creepSpeed,
          );
    return this.guard ? this.guard(moved, ctx, form) : moved;
  }

  private verticalImpulseFor(
    form: Form,
    raw: RawInput | undefined,
    input: GroundInput,
    step: MotionResult,
    ctx: TickContext,
    controlled: boolean,
    waterDepth: number,
  ): number {
    if (form === "car") return step.jumpVelocity;
    if (form === "submarine")
      return this.submarineImpulse(
        raw,
        input,
        step,
        ctx,
        controlled,
        waterDepth,
      );
    return this.airImpulse(form, raw, ctx);
  }

  private submarineImpulse(
    raw: RawInput | undefined,
    input: GroundInput,
    step: MotionResult,
    ctx: TickContext,
    controlled: boolean,
    waterDepth: number,
  ): number {
    const rising =
      input.throttle > 0 &&
      step.state.speed >= 0 &&
      stepProbe(
        ctx,
        this.spec,
        this.spec.submarineStepProbeDrop,
      )(step.forward, Math.max(step.state.speed, MOTION.stepMinSpeed)) > 0;
    const targetVy = submarineVerticalSpeed(
      {
        climb: climbInput(raw),
        controlled,
        rising,
        waterDepth,
      },
      this.spec,
    );
    return verticalImpulse(
      targetVy,
      ctx.velocity.y,
      this.spec.waterVerticalDrag,
    );
  }

  private airImpulse(
    form: Form,
    raw: RawInput | undefined,
    ctx: TickContext,
  ): number {
    const targetVy = clamp(
      verticalSpeed(form, climbInput(raw), this.spec) -
        bankSink(form, this.bank, this.spec),
      -this.spec.maxClimb,
      this.spec.maxClimb,
    );
    return verticalImpulse(
      targetVy,
      ctx.velocity.y,
      this.spec.flightVerticalDrag,
    );
  }
}

const camperGuard: StepGuard = (s, ctx, form) =>
  guardEnds(
    s,
    ctx,
    {
      front: CAMPER_SPEC.bodyFront,
      rear: CAMPER_SPEC.bodyRear,
      halfWidth: CAMPER_SPEC.bodyHalfWidth,
      height: CAMPER_SPEC.carHeight,
    },
    form,
  );

// The bare drivetrain keeps CamperDrive's parking hold out of the comparison,
// so CamperDrive's own super(...) wiring is not pinned here. camperGuard
// mirrors CAMPER_ENDS in kinds/camper/drive.ts, and
// tests/domain/vehicle/kinds/camper covers parking and the real guard.
function camperDrivetrain(yaw: number): TransformingDrive {
  return new TransformingDrive(
    yaw,
    {},
    CAMPER_TRANSFORMING,
    CAMPER_MOTION,
    CAMPER_TYRES,
    { guard: camperGuard },
  );
}

const heading = fc.double({ min: -180, max: 180, noNaN: true });
const terrain = fc.record({
  stepAt: fc.double({ min: 0.5, max: 4, noNaN: true }),
  stepRise: fc.integer({ min: 0, max: 3 }),
});
const component = fc.double({ min: -2, max: 2, noNaN: true });
const tick = fc.record({
  raw: fc.option(
    fc.record({
      moveX: fc.double({ min: -1, max: 1, noNaN: true }),
      moveY: fc.double({ min: -1, max: 1, noNaN: true }),
      jump: fc.boolean(),
    }),
    { nil: undefined },
  ),
  velocity: fc.record({ x: component, y: component, z: component }),
  onGround: fc.boolean(),
  depth: waterDepth,
  awaitingDriver: fc.boolean(),
});
const ticks = fc.array(tick, { minLength: 1, maxLength: 80 });

type Ticks = typeof ticks extends fc.Arbitrary<infer T> ? T : never;

function expectSameTicks(
  drive: TransformingDrive,
  ref: ReferenceDrive,
  { stepAt, stepRise }: { stepAt: number; stepRise: number },
  sequence: Ticks,
): void {
  sequence.forEach(({ raw, velocity, onGround, depth, awaitingDriver }, i) => {
    const ctx: TickContext = {
      tick: i,
      deckSeatInputs: [],
      velocity,
      onGround,
      awaitingDriver,
      ...waterSensors(depth),
      blockTypes: () => [],
      solidAt: (o) => o.y < 0 || (o.x >= stepAt && o.y < stepRise),
    };
    const out = drive.step(raw, ctx);
    const expected = ref.step(raw, ctx);
    expect(drive.speed).toBe(expected.speed);
    expect(drive.yaw).toBe(expected.yaw);
    expect(drive.form).toBe(expected.form);
    expect(drive.inspect().bank).toBe(expected.bank);
    expect(out.impulse).toStrictEqual(expected.impulse);
    expect(out.forward).toStrictEqual(expected.forward);
    expect(out.riders).toStrictEqual(expected.riders);
  });
}

it("the SUV steps tick by tick as today's transforming wiring does", () => {
  fc.assert(
    fc.property(heading, terrain, ticks, (yaw, ground, sequence) => {
      expectSameTicks(
        new SuvDrive(yaw, {}),
        new ReferenceDrive(yaw, SUV_TRANSFORMING, SUV_MOTION, SUV_TYRES),
        ground,
        sequence,
      );
    }),
    { numRuns: 200 },
  );
});

it("the camper's drivetrain with its end guard steps tick by tick as today's wiring does", () => {
  fc.assert(
    fc.property(heading, terrain, ticks, (yaw, ground, sequence) => {
      expectSameTicks(
        camperDrivetrain(yaw),
        new ReferenceDrive(
          yaw,
          CAMPER_TRANSFORMING,
          CAMPER_MOTION,
          CAMPER_TYRES,
          camperGuard,
        ),
        ground,
        sequence,
      );
    }),
    { numRuns: 200 },
  );
});
