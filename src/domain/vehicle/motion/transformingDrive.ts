// Shared transforming drivetrain: forms, landing gear, bank, and vertical motion (ADR 0050).
import { clamp, rightOf, type Vec2 } from "../../shared/vec";
import type {
  Drive,
  DriveStep,
  EngineCommand,
  RestoredValues,
  TickContext,
} from "../drive";
import {
  type DriveInput,
  NEUTRAL_INPUT,
  type RawInput,
  toDriveInput,
} from "../driveInput";
import { SyncedValue } from "../syncedValue";
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
import type { MotionLimits } from "./limits";
import {
  alignOnMount,
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

function stepProbe(
  ctx: TickContext,
  spec: TransformingSpec,
  drop = 0,
): StepProbe {
  return (f, speed) => {
    const r = rightOf(f);
    return stepHeight(
      (ahead, side, dy) =>
        ctx.solidAt({
          x: f.x * ahead + r.x * side,
          y: dy - drop,
          z: f.z * ahead + r.z * side,
        }),
      speed,
      { front: spec.hitboxFront, height: spec.carHeight },
    );
  };
}

/** Whether there is a solid block within gearDownHeight below the center or a corner of the vehicle. */
function groundNear(
  ctx: TickContext,
  f: Vec2,
  spec: TransformingSpec,
): boolean {
  const r = rightOf(f);
  const d = spec.gearProbeOffset;
  const spots = [
    [0, 0],
    [d, d],
    [d, -d],
    [-d, d],
    [-d, -d],
  ] as const;
  for (let dy = 1; dy <= spec.gearDownHeight; dy++)
    for (const [ahead, side] of spots)
      if (
        ctx.solidAt({
          x: f.x * ahead + r.x * side,
          y: -dy,
          z: f.z * ahead + r.z * side,
        })
      )
        return true;
  return false;
}

/**
 * Takeoff ignores the controls, and there is no handbrake in the air or as a
 * submarine (ADR 0021). Out of car form the stick pulled back sinks instead of
 * reversing, in the air (ADR 0032) and under water (ADR 0040).
 */
function driveInputFor(raw: RawInput | undefined, form: Form): DriveInput {
  if (form === "takeoff") return NEUTRAL_INPUT;
  const input = toDriveInput(raw);
  if (form === "car") return input;
  return { ...input, throttle: Math.max(0, input.throttle), handbrake: false };
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

export class TransformingDrive implements Drive {
  private motion: MotionState;
  private formState: FormState;
  private bank = 0;
  private readonly bankSync = new SyncedValue<number>();
  private gearDown: boolean;
  private readonly gearDownSync = new SyncedValue<boolean>();

  constructor(
    yaw: number,
    restored: RestoredValues<"form">,
    protected readonly spec: TransformingSpec,
    protected readonly limits: MotionLimits,
    private readonly guard?: StepGuard,
  ) {
    const form = isForm(restored.form) ? restored.form : "car";
    this.motion = initialMotion(yaw);
    this.formState = initialForm(form);
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

  get wheelsDown(): boolean {
    return this.gearDown;
  }

  get bankAngle(): number {
    return this.bank;
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

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const motion = this.motion;
    // A passenger may be moving up to the driver seat (ADR 0078).
    const controlled = raw !== undefined || ctx.awaitingDriver === true;
    const waterDepth = waterDepthAt(
      ctx.location,
      ctx.waterAt,
      this.spec.carHeight,
    );
    const velocity = { x: ctx.velocity.x, z: ctx.velocity.z };
    const before = this.formState.form;
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
    const form = this.formState.form;
    const input = driveInputFor(raw, form);
    const yawBefore = motion.yaw;
    const moved: MotionResult =
      form === "car"
        ? stepMotion(
            motion,
            input,
            { velocity, onGround: ctx.onGround },
            stepProbe(ctx, this.spec),
            this.limits,
          )
        : stepMediumMotion(
            motion,
            input,
            velocity,
            form === "submarine" ? this.spec.water : this.spec.air,
            this.limits,
          );
    const step = this.guard ? this.guard(moved, ctx, form) : moved;
    this.bank = stepBank(
      this.bank,
      form,
      yawBefore,
      step.state.yaw,
      this.limits.turnRate,
      this.spec,
    );
    let impulseY: number;
    if (form === "car") {
      impulseY = step.jumpVelocity;
    } else if (form === "submarine") {
      // Gated like a step jump in stepMotion (speed >= 0). The stepMinSpeed
      // floor only sets how far ahead the probe looks, not whether it rises:
      // pressed against a shore step the wall check drops speed to about 0,
      // and the bare look-ahead margin would miss a step face just beyond it
      // (ADR 0035).
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
      impulseY = verticalImpulse(
        targetVy,
        ctx.velocity.y,
        this.spec.waterVerticalDrag,
      );
    } else {
      const targetVy = clamp(
        verticalSpeed(form, climbInput(raw), this.spec) -
          bankSink(form, this.bank, this.spec),
        -this.spec.maxClimb,
        this.spec.maxClimb,
      );
      impulseY = verticalImpulse(
        targetVy,
        ctx.velocity.y,
        this.spec.flightVerticalDrag,
      );
    }
    const bank = this.bankSync.next(this.bank);
    this.gearDown = nextGearDown(this.gearDown, form, () =>
      groundNear(ctx, step.forward, this.spec),
    );
    const gearDown = this.gearDownSync.next(this.gearDown);

    this.motion = step.state;
    return {
      impulse: { x: step.impulse.x, y: impulseY, z: step.impulse.z },
      forward: step.forward,
      commands: [
        ...(form === before ? [] : formCommands(form)),
        ...(bank === undefined ? [] : [bankCommand(bank)]),
        ...(gearDown === undefined ? [] : [gearCommand(gearDown)]),
      ],
      riders: { thirdPerson: form !== "car", underwater: form === "submarine" },
    };
  }
}
