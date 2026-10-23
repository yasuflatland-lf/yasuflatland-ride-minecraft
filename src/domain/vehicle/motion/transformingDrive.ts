// Shared transforming drivetrain: forms, landing gear, bank, and vertical motion, with a per-kind control mapping, horizontal step, and step-up switch (ADR 0050, 0089).

import { SyncedValue } from "../../shared/syncedValue";
import { clamp, localOffset, type Vec2 } from "../../shared/vec";
import type {
  Drive,
  DriveStep,
  EngineCommand,
  RestoredValues,
  TickContext,
} from "../drive";
import { NEUTRAL_CONTROL, type RawInput, toDriveInput } from "../driveInput";
import { bankSink, stepBank } from "./bank";
import { MOTION } from "./constants";
import {
  climbInput,
  type Form,
  type FormState,
  initialForm,
  isForm,
  stepForm,
  verticalImpulse,
  verticalSpeed,
} from "./forms";
import { nextGearDown } from "./landingGear";
import type { MotionLimits, TyreLimits } from "./limits";
import {
  alignOnMount,
  type GroundInput,
  initialMotion,
  type MotionResult,
  type MotionState,
  type StepProbe,
  stepMediumMotion,
  stepMotion,
} from "./motion";
import { stepHeight } from "./stepUp";
import { submarineVerticalSpeed } from "./submarine";
import type { TransformingSpec } from "./transforming";
import { bankCommand, formCommands, gearCommand } from "./transformingEntity";
import { waterDepthAt } from "./water";

const NO_STEP: StepProbe = () => 0;

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

/** Whether there is a solid block within gearDownHeight below the center or a corner of the vehicle. */
function groundNear(
  ctx: TickContext,
  f: Vec2,
  spec: TransformingSpec,
): boolean {
  const d = spec.gearProbeOffset;
  const spots = [
    [0, 0],
    [d, d],
    [d, -d],
    [-d, d],
    [-d, -d],
  ] as const;
  for (let dy = 1; dy <= spec.gearDownHeight; dy++)
    for (const [ahead, side] of spots) {
      const o = localOffset(f, ahead, side);
      if (ctx.solidAt({ x: o.x, y: -dy, z: o.z })) return true;
    }
  return false;
}

/**
 * Takeoff ignores the controls, and there is no handbrake in the air or as a
 * submarine (ADR 0021). Out of car form the stick pulled back sinks instead of
 * reversing, in the air (ADR 0032) and under water (ADR 0040). A sideways
 * stick creeps in every form (ADR 0018, 0089).
 */
export function groundInputFor(
  raw: RawInput | undefined,
  form: Form,
): GroundInput {
  const control = form === "takeoff" ? NEUTRAL_CONTROL : toDriveInput(raw);
  const car = form === "car";
  return {
    throttle: car ? control.throttle : Math.max(0, control.throttle),
    steer: control.steer,
    handbrake: car && control.jump,
    creep: control.sideways,
  };
}

/**
 * A kind's last word on the horizontal step. It gets the form because only car
 * form has a step probe that climbs low cells (ADR 0067).
 */
export type StepGuard = (
  step: MotionResult,
  ctx: TickContext,
  form: Form,
) => MotionResult;

/** What a kind's horizontal step reads each tick. */
export interface HorizontalStepInput {
  readonly state: MotionState;
  readonly input: GroundInput;
  readonly ctx: TickContext;
  readonly form: Form;
  /** Jump went down this tick after being up the tick before. */
  readonly jumpTapped: boolean;
  /** The car-form step probe; it never finds a step when the kind turns step-up off. */
  readonly probe: StepProbe;
  readonly spec: TransformingSpec;
  readonly limits: MotionLimits;
  readonly tyres: TyreLimits;
}

export type HorizontalStep = (h: HorizontalStepInput) => MotionResult;

/** Today's step: stepMotion in car form, stepMediumMotion (spec.water as a submarine, else spec.air) otherwise. */
export function transformingHorizontalStep(
  h: HorizontalStepInput,
): MotionResult {
  const velocity = { x: h.ctx.velocity.x, z: h.ctx.velocity.z };
  if (h.form === "car")
    return stepMotion(
      h.state,
      h.input,
      { velocity, onGround: h.ctx.onGround },
      h.probe,
      h.limits,
      h.tyres,
    );
  const medium = h.form === "submarine" ? h.spec.water : h.spec.air;
  return stepMediumMotion(
    h.state,
    h.input,
    velocity,
    medium,
    h.limits,
    h.tyres.creepSpeed,
  );
}

/** A kind's meaning for the stick and Jump in each form (ADR 0089). */
export type InputMapping = (
  raw: RawInput | undefined,
  form: Form,
) => GroundInput;

export interface TransformingOptions {
  /** Defaults to groundInputFor. */
  readonly inputFor?: InputMapping;
  /** Defaults to transformingHorizontalStep. */
  readonly horizontal?: HorizontalStep;
  /** Whether car form climbs one- and two-block steps and a submarine rises at a shore step (ADR 0004, 0035); default true. False turns off both probes. */
  readonly stepUp?: boolean;
  readonly guard?: StepGuard;
}

export class TransformingDrive implements Drive {
  private motion: MotionState;
  private formState: FormState;
  private readonly formSync: SyncedValue<Form>;
  private bank = 0;
  private readonly bankSync = new SyncedValue<number>();
  private gearDown: boolean;
  private readonly gearDownSync = new SyncedValue<boolean>();
  private readonly inputFor: InputMapping;
  private readonly horizontal: HorizontalStep;
  private readonly stepUp: boolean;
  private readonly guard: StepGuard | undefined;

  constructor(
    yaw: number,
    restored: RestoredValues<"form">,
    protected readonly spec: TransformingSpec,
    protected readonly limits: MotionLimits,
    protected readonly tyres: TyreLimits,
    options: TransformingOptions = {},
  ) {
    this.inputFor = options.inputFor ?? groundInputFor;
    this.horizontal = options.horizontal ?? transformingHorizontalStep;
    this.stepUp = options.stepUp ?? true;
    this.guard = options.guard;
    const form = isForm(restored.form) ? restored.form : "car";
    this.motion = initialMotion(yaw);
    this.formState = initialForm(form);
    this.formSync = new SyncedValue<Form>({ value: form });
    this.gearDown = form === "car";
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  get form(): Form {
    return this.formState.form;
  }

  /**
   * A read-only snapshot of state the engine never reads back, for unit tests
   * only. Production code must not call it. Kinds may extend the snapshot.
   */
  inspect(): Readonly<{ wheelsDown: boolean; bank: number }> {
    return { wheelsDown: this.gearDown, bank: this.bank };
  }

  /** Stops the drive at rest facing `yaw`, for a kind that holds its vehicle (ADR 0068). */
  protected restartAt(yaw: number): void {
    this.motion = initialMotion(yaw);
  }

  onDriverMounted(driverYaw: number): void {
    this.motion = alignOnMount(this.motion, driverYaw);
  }

  /**
   * Kinds with doors override this to play the vacated seat's door animation
   * and sound (ADR 0007, 0019).
   */
  onSeatVacated(_seat: number): readonly EngineCommand[] {
    return [];
  }

  resync(): void {
    this.formSync.resync();
    this.bankSync.resync();
    this.gearDownSync.resync();
  }

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    // A passenger may be moving up to the driver seat (ADR 0078).
    const controlled = raw !== undefined || ctx.awaitingDriver === true;
    const waterDepth = waterDepthAt(
      ctx.location,
      ctx.waterAt,
      this.spec.carHeight,
    );
    const jumpTapped = (raw?.jump ?? false) && !this.formState.jumpHeld;
    const form = this.advanceForm(raw, ctx, controlled, waterDepth);
    const input = this.inputFor(raw, form);
    const yawBefore = this.motion.yaw;
    const step = this.moveHorizontally(input, ctx, form, jumpTapped);
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
    const sentForm = this.formSync.next(form);
    const bank = this.bankSync.next(this.bank);
    this.gearDown = nextGearDown(this.gearDown, form, () =>
      groundNear(ctx, step.forward, this.spec),
    );
    const gearDown = this.gearDownSync.next(this.gearDown);

    this.motion = step.state;
    return {
      impulse: { x: step.impulse.x, y: impulseY, z: step.impulse.z },
      forward: step.forward,
      commands: this.engineCommands(sentForm, bank, gearDown),
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
    jumpTapped: boolean,
  ): MotionResult {
    const moved = this.horizontal({
      state: this.motion,
      input,
      ctx,
      form,
      jumpTapped,
      probe: this.stepUp ? stepProbe(ctx, this.spec) : NO_STEP,
      spec: this.spec,
      limits: this.limits,
      tyres: this.tyres,
    });
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
    // Gated like a step jump in stepMotion (speed >= 0). The stepMinSpeed
    // floor only sets how far ahead the probe looks, not whether it rises:
    // pressed against a shore step the wall check drops speed to about 0,
    // and the bare look-ahead margin would miss a step face just beyond it
    // (ADR 0035).
    const rising =
      this.stepUp &&
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

  private engineCommands(
    sentForm: Form | undefined,
    bank: number | undefined,
    gearDown: boolean | undefined,
  ): EngineCommand[] {
    return [
      ...(sentForm === undefined ? [] : formCommands(sentForm)),
      ...(bank === undefined ? [] : [bankCommand(bank)]),
      ...(gearDown === undefined ? [] : [gearCommand(gearDown)]),
    ];
  }
}
