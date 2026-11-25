// Shared transforming drivetrain: forms, landing gear, bank, and vertical motion, with a per-kind control mapping, horizontal step, and per-tick step-up hook (ADR 0050, 0089).

import { clamp, localOffset, type Vec2 } from "../../shared/vec";
import { BOOST_CONTROL, type BoostControl } from "../boost";
import { type CapabilityKey, offer } from "../capability";
import type {
  Drive,
  DriveStep,
  EngineCommand,
  RestoredValues,
  TickContext,
} from "../drive";
import { NEUTRAL_CONTROL, type RawInput, toDriveInput } from "../driveInput";
import { SyncedCommands } from "../syncedCommands";
import { bankSink, stepBank } from "./bank";
import { boostedLimits, boostedMedium, SpeedCeiling } from "./boost";
import { MOTION } from "./constants";
import {
  climbInput,
  type Form,
  type FormState,
  forgetTap,
  initialForm,
  isDry,
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
import { surfaceHold } from "./surface";
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
      {
        front: spec.hitboxFront,
        height: spec.carHeight,
        laneOffset: spec.stepLaneOffset,
      },
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
  /** Depth above the feet already sensed for this tick, so custom steps need no extra water probe. */
  readonly waterDepth: number;
  /** Jump went down this tick after being up the tick before. */
  readonly jumpTapped: boolean;
  /** The car-form step probe; it never finds a step on a tick when `stepUpEnabled()` is false. */
  readonly probe: StepProbe;
  readonly spec: TransformingSpec;
  readonly limits: MotionLimits;
  readonly tyres: TyreLimits;
  readonly boostTouchdown?: "contact" | "grounded";
}

export type HorizontalStep = (h: HorizontalStepInput) => MotionResult;

/** Car uses stepMotion, with ground control and friction on water for surface kinds. Other forms use spec.water as a submarine, else spec.air. */
export function transformingHorizontalStep(
  h: HorizontalStepInput,
): MotionResult {
  const velocity = { x: h.ctx.velocity.x, z: h.ctx.velocity.z };
  if (h.form === "car")
    return stepMotion(
      h.state,
      h.input,
      {
        velocity,
        boostTouchdown: h.boostTouchdown,
        onGround:
          h.ctx.onGround ||
          (h.spec.waterPolicy === "surface" && !isDry(h.waterDepth)),
      },
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
  /** What `stepUpEnabled()` returns unless a kind overrides it: whether car form climbs one- and two-block steps and a submarine rises at a shore step (ADR 0004, 0035); default true. False turns off both probes. */
  readonly stepUp?: boolean;
  readonly guard?: StepGuard;
}

/** Readings the last step derived from its raw input and sensors. */
interface StepReadings {
  readonly input: GroundInput;
  readonly waterDepth: number;
}

export class TransformingDrive implements Drive {
  private stepReadings: StepReadings = {
    input: groundInputFor(undefined, "car"),
    waterDepth: 0,
  };
  private motion: MotionState;
  private formState: FormState;
  private readonly synced: SyncedCommands<TransformingDrive>;
  private bank = 0;
  private gearDown: boolean;
  private readonly inputFor: InputMapping;
  private readonly horizontal: HorizontalStep;
  private readonly stepUp: boolean;
  private readonly guard: StepGuard | undefined;
  private readonly ceiling: SpeedCeiling;
  private boostOn = false;
  private boostedContact = false;
  private readonly boostControl: BoostControl = {
    isOn: () => this.boostOn,
    toggle: () => {
      this.boostOn = !this.boostOn;
      return this.boostOn;
    },
  };

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
    this.ceiling = new SpeedCeiling(limits.maxSpeed);
    const form = isForm(restored.form) ? restored.form : "car";
    this.motion = initialMotion(yaw);
    this.formState = initialForm(form);
    this.synced = new SyncedCommands<TransformingDrive>()
      .add((drive) => drive.form, formCommands, { value: form })
      .add((drive) => drive.bank, bankCommand)
      .add((drive) => drive.gearDown, gearCommand);
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

  /** The readings of the current or last step; neutral input and 0 before the first step. */
  protected get readings(): StepReadings {
    return this.stepReadings;
  }

  /** The body bank in degrees after the last step (ADR 0026). */
  protected get bankAngle(): number {
    return this.bank;
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

  /**
   * Whether this step's probes may find a step: the car-form step probe and the
   * submarine rising probe (ADR 0004, 0035). It returns the `stepUp` option.
   * A kind whose step-up depends on its own state overrides this, because a
   * `super(...)` argument cannot close over `this` (TS 17009). It is read during
   * `step`, never in the constructor, so an override may read fields the subclass
   * sets after `super(...)`. An override must give the same answer for every read
   * within one step.
   */
  protected stepUpEnabled(): boolean {
    return this.stepUp;
  }

  onDriverMounted(driverYaw: number): void {
    this.boostOn = false;
    this.formState = forgetTap(this.formState);
    this.alignToDriver(driverYaw);
  }

  onDriverLeft(): void {
    this.boostOn = false;
  }

  capability<T>(key: CapabilityKey<T>): T | undefined {
    if (this.spec.boost) return offer(key, BOOST_CONTROL, this.boostControl);
  }

  /** Turns the drive to a newly mounted driver's view; kinds that hold their heading override this. */
  protected alignToDriver(driverYaw: number): void {
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
    this.synced.resync();
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
    const previousForm = this.formState.form;
    const form = this.advanceForm(raw, ctx, controlled, waterDepth);
    const flight = form !== "car" && form !== "submarine";
    const boostedNow =
      this.boostOn && flight && raw !== undefined && !ctx.awaitingDriver;
    const scale = this.spec.boost?.flightScale ?? 1;
    const speedCap = this.ceiling.next(boostedNow, scale);
    const normalSpeed = this.limits.maxSpeed;
    const speedScale =
      form !== "submarine" && speedCap > normalSpeed
        ? speedCap / normalSpeed
        : 1;
    const input = this.inputFor(raw, form);
    this.stepReadings = { input, waterDepth };
    const yawBefore = this.motion.yaw;
    const step = this.moveHorizontally(
      input,
      ctx,
      form,
      previousForm,
      jumpTapped,
      waterDepth,
      speedScale,
    );
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
      speedScale,
    );
    this.gearDown = nextGearDown(this.gearDown, form, () =>
      groundNear(ctx, step.forward, this.spec),
    );
    this.motion = step.state;
    return {
      impulse: { x: step.impulse.x, y: impulseY, z: step.impulse.z },
      forward: step.forward,
      commands: this.synced.next(this),
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
    previousForm: Form,
    jumpTapped: boolean,
    waterDepth: number,
    speedScale: number,
  ): MotionResult {
    const boostedGround =
      form === "car" && ctx.onGround && isDry(waterDepth) && speedScale > 1;
    const contact =
      boostedGround && previousForm !== "car" && previousForm !== "submarine";
    const boostTouchdown = contact
      ? "contact"
      : boostedGround && this.boostedContact
        ? "grounded"
        : undefined;
    this.boostedContact = contact;
    const spec =
      form !== "car" && speedScale > 1
        ? { ...this.spec, air: boostedMedium(this.spec.air, speedScale) }
        : this.spec;
    const moved = this.horizontal({
      state: this.motion,
      input,
      ctx,
      form,
      jumpTapped,
      waterDepth,
      probe: this.stepUpEnabled() ? stepProbe(ctx, this.spec) : NO_STEP,
      spec,
      limits:
        speedScale > 1 ? boostedLimits(this.limits, speedScale) : this.limits,
      tyres: this.tyres,
      boostTouchdown,
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
    climbScale: number,
  ): number {
    if (form === "car") {
      if (this.spec.waterPolicy === "surface" && !isDry(waterDepth)) {
        if (step.jumpVelocity > 0) return step.jumpVelocity;
        return verticalImpulse(
          surfaceHold(
            waterDepth,
            this.spec.carHeight,
            ctx.velocity.y,
            this.spec,
          ),
          ctx.velocity.y,
          this.spec.waterVerticalDrag,
        );
      }
      return step.jumpVelocity;
    }
    if (form === "submarine")
      return this.submarineImpulse(
        raw,
        input,
        step,
        ctx,
        controlled,
        waterDepth,
      );
    return this.airImpulse(form, raw, ctx, climbScale);
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
      this.stepUpEnabled() &&
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
    climbScale: number,
  ): number {
    const maxClimb = this.spec.maxClimb * climbScale;
    const targetVy = clamp(
      verticalSpeed(form, climbInput(raw), {
        takeoffClimb: this.spec.takeoffClimb,
        landingSink: this.spec.landingSink,
        maxClimb,
      }) - bankSink(form, this.bank, this.spec),
      -maxClimb,
      maxClimb,
    );
    return verticalImpulse(
      targetVy,
      ctx.velocity.y,
      this.spec.flightVerticalDrag,
    );
  }
}
