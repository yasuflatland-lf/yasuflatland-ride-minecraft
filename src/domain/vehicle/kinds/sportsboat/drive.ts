// The sports boat's drive: the engine floats the hull and the script drives only x and z (ADR 0051).

import { SyncedValue } from "../../../shared/syncedValue";
import { clamp, dot, type Vec2 } from "../../../shared/vec";
import type { Dock } from "../../dock/dock";
import type { HoldPose } from "../../dock/floor";
import type { Drive, DriveStep, EngineCommand, TickContext } from "../../drive";
import {
  type ControlInput,
  type RawInput,
  toDriveInput,
} from "../../driveInput";
import type { RestoredOf } from "../../entityContract";
import { MOTION } from "../../motion/constants";
import { DOCK, heldStep, pushesStick } from "../../motion/dock";
import {
  dockCommands,
  dockedCommand,
  undockCommands,
} from "../../motion/dockEntity";
import type { MotionLimits, TyreLimits } from "../../motion/limits";
import {
  alignOnMount,
  type GroundInput,
  hitWall,
  initialMotion,
  type Medium,
  type MediumInput,
  type MotionResult,
  type MotionState,
  stepMediumMotion,
  stepMotion,
} from "../../motion/motion";
import { waterBelowAt, waterDepthAt } from "../../motion/water";
import { seatWorldPositions } from "../../seats";
import { stepRoll, stepTrim } from "./attitude";
import { floorCells, holdHeight } from "./deck";
import {
  icebreakerCommand,
  rollCommand,
  type SPORTSBOAT_ENTITY,
  trimCommand,
} from "./entity";
import { ICEBREAKER_SWITCH_ITEM } from "./equipment";
import {
  bowBlocked,
  icebreakerColumns,
  type LastCut,
  recutDue,
} from "./icebreaker";
import { SPORTSBOAT_MOTION, SPORTSBOAT_PROFILE } from "./profile";
import { SPORTSBOAT_SPEC } from "./spec";

export const SPORTSBOAT_DRAG = Object.freeze({
  initial: SPORTSBOAT_SPEC.waterDragInitial,
  min: SPORTSBOAT_SPEC.waterDragMin,
  max: SPORTSBOAT_SPEC.waterDragMax,
  smoothing: SPORTSBOAT_SPEC.waterDragSmoothing,
  minGiven: SPORTSBOAT_SPEC.waterDragMinGiven,
});

export const SPORTSBOAT_WATER: Medium = Object.freeze({
  drag: SPORTSBOAT_DRAG.initial,
  // The drive overrides this with its own limits' maxSpeed; it stays so this is a complete Medium.
  maxSpeed: SPORTSBOAT_SPEC.maxSpeed,
});

function boundDrag(drag: number): number {
  return clamp(drag, SPORTSBOAT_DRAG.min, SPORTSBOAT_DRAG.max);
}

/** The estimate a tick starts from: the stored one, bounded, or the initial value. */
function currentWaterDrag(prev: number | undefined): number {
  return boundDrag(prev ?? SPORTSBOAT_DRAG.initial);
}

export function estimateWaterDrag(
  prev: number | undefined,
  given: Vec2 | undefined,
  observed: Vec2,
): number {
  const estimate = currentWaterDrag(prev);
  if (!given) return estimate;
  const givenSq = dot(given, given);
  if (
    givenSq <= SPORTSBOAT_DRAG.minGiven ** 2 ||
    hitWall(observed, given, estimate * MOTION.blockedRatio)
  )
    return estimate;
  const sample = boundDrag(dot(observed, given) / givenSq);
  return boundDrag(
    estimate * (1 - SPORTSBOAT_DRAG.smoothing) +
      sample * SPORTSBOAT_DRAG.smoothing,
  );
}

function dockAt(pose: HoldPose): Dock {
  return {
    hold: pose,
    cells: floorCells(pose),
    seats: seatWorldPositions(pose, SPORTSBOAT_PROFILE.seats.positions),
  };
}

/** Afloat, a sideways stick creeps and Jump does nothing: the boat has no handbrake (ADR 0089). */
export function afloatInput(control: ControlInput): MediumInput {
  return {
    throttle: control.throttle,
    steer: control.steer,
    creep: control.sideways,
  };
}

/** The input a beached boat drives by: reverse and steering only, never forward or creep (ADR 0080). */
export function beachedInput(control: ControlInput): GroundInput {
  return {
    throttle: Math.min(0, control.throttle),
    steer: control.steer,
    handbrake: false,
    creep: false,
  };
}

export function isAfloat(depth: number, below: () => boolean): boolean {
  return depth > 0 || below();
}

/** What a sports boat drive carries from one tick to the next. */
export interface SportsboatDriveState {
  readonly motion: MotionState;
  /** The water drag estimate (ADR 0053): undefined until the boat first floats, kept while beached. */
  readonly waterDrag?: number;
}

export class SportsboatDrive implements Drive {
  private icebreakerOn: boolean;
  private readonly icebreakerSync: SyncedValue<boolean>;
  private motion: MotionState;
  private readonly beachedTyres: TyreLimits;
  private dragEstimate: number | undefined;
  private trim = 0;
  private roll = 0;
  private docked: HoldPose | undefined;
  private stillTicks = 0;
  private lastCut: LastCut | undefined;
  private resendDocked = false;
  // Until the drive first holds, the entity keeps its default docked value and needs no resend.
  private heldOnce = false;
  private restoredDocked: boolean;
  private readonly trimSync = new SyncedValue<number>();
  private readonly rollSync = new SyncedValue<number>();

  /** `limits` and `creepSpeed` other than the boat's own are for tests that vary one value. */
  constructor(
    yaw: number,
    restored: RestoredOf<typeof SPORTSBOAT_ENTITY>,
    private readonly limits: MotionLimits = SPORTSBOAT_MOTION,
    private readonly creepSpeed: number = SPORTSBOAT_SPEC.creepSpeed,
  ) {
    this.motion = initialMotion(yaw);
    this.icebreakerOn = restored.icebreaker === true;
    this.icebreakerSync = new SyncedValue({ value: this.icebreakerOn });
    this.restoredDocked = restored.docked === true;
    // A beached hull has no handbrake and does not creep (beachedInput), so
    // stepMotion never reads these; the grip stands in for the handbrake grip.
    this.beachedTyres = Object.freeze({
      handbrakeGrip: limits.grip,
      creepSpeed,
    });
  }

  get speed(): number {
    return this.motion.speed;
  }

  get yaw(): number {
    return this.motion.yaw;
  }

  /**
   * A read-only snapshot of state the engine never reads back, for unit tests
   * and in-game test scenarios only. Production code must not call it.
   */
  inspect(): Readonly<{
    docked: boolean;
    waterDrag: number | undefined;
    trim: number;
    roll: number;
  }> {
    return {
      docked: this.docked !== undefined,
      waterDrag: this.dragEstimate,
      trim: this.trim,
      roll: this.roll,
    };
  }

  /**
   * The state this drive carries to the next tick. Tests save it and hand it
   * to restore() to start another drive mid-run.
   */
  get state(): SportsboatDriveState {
    return { motion: this.motion, waterDrag: this.dragEstimate };
  }

  /**
   * Starts the drive from a state saved with `state`. Only tests call it; a
   * rebuilt vehicle starts from its RestoredValues instead.
   */
  restore(state: SportsboatDriveState): this {
    this.motion = state.motion;
    this.dragEstimate = state.waterDrag;
    return this;
  }

  onDriverMounted(driverYaw: number): void {
    // A held hull keeps its hold yaw, so turning the drive to the driver here
    // would point the seats and headlights away from the bow until undocking.
    if (this.docked || this.restoredDocked) return;
    this.motion = alignOnMount(this.motion, driverYaw);
  }

  onSeatVacated(_seat: number): readonly EngineCommand[] {
    return [];
  }

  toolState(item: string): string | undefined {
    if (item !== ICEBREAKER_SWITCH_ITEM) return undefined;
    return this.icebreakerOn ? "on" : "off";
  }

  setToolState(item: string, state: string): boolean {
    if (item !== ICEBREAKER_SWITCH_ITEM || (state !== "on" && state !== "off"))
      return false;
    this.icebreakerOn = state === "on";
    return true;
  }

  resync(): void {
    this.icebreakerSync.resync();
    this.resendDocked = this.heldOnce;
    this.trimSync.resync();
    this.rollSync.resync();
  }

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const wasDocked = this.docked !== undefined || this.restoredDocked;
    const hull = this.stepHull(raw, ctx);
    const icebreaker = this.icebreakerSync.next(this.icebreakerOn);
    const step =
      icebreaker === undefined
        ? hull
        : {
            ...hull,
            commands: [...hull.commands, icebreakerCommand(icebreaker)],
          };
    const held = this.docked !== undefined;
    this.heldOnce ||= held;
    if (!this.resendDocked) return step;
    this.resendDocked = false;
    // The docked property goes out only when the hull docks or departs, so after a failed
    // send it goes out again unless this step docks or departs and sends it anyway (ADR 0156).
    // A held step skips the attitude latches, so it resends trim and roll here too.
    if (held !== wasDocked) return step;
    return {
      ...step,
      commands: [
        ...step.commands,
        dockedCommand(held),
        ...(held ? this.attitudeCommands() : []),
      ],
    };
  }

  private attitudeCommands(): EngineCommand[] {
    const commands: EngineCommand[] = [];
    const trim = this.trimSync.next(this.trim);
    if (trim !== undefined) commands.push(trimCommand(trim));
    const roll = this.rollSync.next(this.roll);
    if (roll !== undefined) commands.push(rollCommand(roll));
    return commands;
  }

  private stepHull(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    if (this.restoredDocked && !this.docked) {
      this.docked = { ...ctx.location, yaw: this.motion.yaw };
      this.restoredDocked = false;
    }
    const commands: EngineCommand[] = [];
    let boardDeckRiders = false;
    if (this.docked) {
      if (!pushesStick(raw)) {
        return heldStep(
          dockAt(this.docked),
          this.docked.yaw,
          ctx.deckSeatInputs,
        );
      }
      boardDeckRiders = true;
      commands.push(...undockCommands());
      this.docked = undefined;
      this.stillTicks = 0;
    }
    // The boat maps the controls itself: no handbrake, creep only afloat (ADR 0089).
    const control = toDriveInput(raw);
    const motion = this.motion;
    let step: MotionResult;
    // Body height bounds the query because the boat only tests whether depth is above zero.
    const liquidAt = (offset: import("../../../shared/vec").Vec3) =>
      ctx.waterAt(offset) || (ctx.lavaAt?.(offset) ?? false);
    const depth = waterDepthAt(
      ctx.location,
      liquidAt,
      SPORTSBOAT_PROFILE.body.height,
    );
    const afloat = isAfloat(depth, () => waterBelowAt(liquidAt));
    if (afloat) {
      const waterDrag = estimateWaterDrag(
        this.dragEstimate,
        motion.mediumExpected,
        ctx.velocity,
      );
      // Divide by the updated estimate, but check walls against the one the
      // estimator checked, so a tick taken as a drag sample is never also a wall hit.
      step = stepMediumMotion(
        motion,
        afloatInput(control),
        ctx.velocity,
        {
          ...SPORTSBOAT_WATER,
          maxSpeed: this.limits.maxSpeed,
          drag: waterDrag,
          wallDrag: currentWaterDrag(this.dragEstimate),
        },
        this.limits,
        this.creepSpeed,
      );
      this.dragEstimate = waterDrag;
    } else {
      // Beached, it can only reverse, so a player can back it into the water
      // (ADR 0080); it never steps up a block.
      step = stepMotion(
        motion,
        beachedInput(control),
        { velocity: ctx.velocity, onGround: ctx.onGround },
        () => 0,
        this.limits,
        this.beachedTyres,
      );
    }
    this.motion = step.state;
    this.stillTicks =
      afloat && raw === undefined && Math.abs(step.state.speed) < DOCK.maxSpeed
        ? this.stillTicks + 1
        : 0;
    if (this.stillTicks >= DOCK.ticks) {
      const holdY = holdHeight(ctx.location.y, (dy) =>
        liquidAt({ x: 0, y: dy, z: 0 }),
      );
      if (holdY !== undefined) {
        this.docked = { ...ctx.location, y: holdY, yaw: step.state.yaw };
        this.motion = { ...step.state, speed: 0 };
        commands.push(...dockCommands());
      }
    }
    if (this.docked) {
      // A docked boat sits level, so docking clears any residual trim or roll.
      this.trim = 0;
      this.roll = 0;
    } else {
      this.trim = stepTrim(
        this.trim,
        motion.speed,
        step.state.speed,
        afloat,
        this.limits,
      );
      this.roll = stepRoll(
        this.roll,
        motion.yaw,
        step.state.yaw,
        step.state.speed,
        afloat,
        this.limits,
      );
    }
    commands.push(...this.attitudeCommands());
    // Buoyancy and gravity belong to the engine, so the script never pushes vertically.
    return {
      impulse: { x: step.impulse.x, y: 0, z: step.impulse.z },
      forward: step.forward,
      commands,
      riders: { thirdPerson: false, underwater: false },
      boardDeckRiders,
      ...(this.icebreakerCut(
        raw,
        ctx,
        afloat,
        control.throttle,
        step.state.yaw,
      ) && {
        cut: icebreakerColumns(ctx.location, step.state.yaw),
      }),
      ...(this.docked && { dock: dockAt(this.docked) }),
    };
  }

  private icebreakerCut(
    raw: RawInput | undefined,
    ctx: TickContext,
    afloat: boolean,
    throttle: number,
    yaw: number,
  ): boolean {
    const blocked =
      this.icebreakerOn &&
      raw !== undefined &&
      afloat &&
      throttle > 0 &&
      bowBlocked(ctx.location, yaw, ctx.solidAt);
    if (!blocked) {
      this.lastCut = undefined;
      return false;
    }
    if (!recutDue(this.lastCut, ctx.tick, ctx.location)) return false;
    this.lastCut = { tick: ctx.tick, location: ctx.location };
    return true;
  }
}
