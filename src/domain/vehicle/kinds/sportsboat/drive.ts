// The sports boat's drive: the engine floats the hull and the script drives only x and z (ADR 0051).

import { clamp, dot, type Vec2 } from "../../../shared/vec";
import type { Dock } from "../../dock/dock";
import type { DeckBlock, HoldPose } from "../../dock/floor";
import type { Drive, DriveStep, EngineCommand, TickContext } from "../../drive";
import {
  type ControlInput,
  type RawInput,
  toDriveInput,
} from "../../driveInput";
import type { RestoredOf } from "../../entityContract";
import { equipmentBindings } from "../../equipment/equipment";
import { MOTION } from "../../motion/constants";
import { Hold, heldStep, pushesStick } from "../../motion/dock";
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
import { DRIVER_SEAT, seatWorldPositions } from "../../seats";
import { SPEC } from "../../spec";
import { SyncedCommands } from "../../syncedCommands";
import { stepRoll, stepTrim } from "./attitude";
import { floorCells, holdHeight } from "./deck";
import {
  icebreakerCommand,
  rollCommand,
  type SPORTSBOAT_ENTITY,
  trimCommand,
} from "./entity";
import {
  ICEBREAKER_OFF,
  ICEBREAKER_ON,
  ICEBREAKER_SWITCH_ITEM,
  SPORTSBOAT_EQUIPMENT,
} from "./equipment";
import {
  bowBlocked,
  icebreakerColumns,
  type LastCut,
  recutDue,
} from "./icebreaker";
import { SPORTSBOAT_MOTION, SPORTSBOAT_PROFILE } from "./profile";
import { SPORTSBOAT_SPEC } from "./spec";
import { surfaceLift } from "./surfacing";

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

function dockAt(pose: HoldPose): Dock<DeckBlock> {
  return {
    hold: pose,
    cells: floorCells(pose),
    seats: seatWorldPositions(pose, SPORTSBOAT_PROFILE.seats.positions).map(
      (at, i) => (i === DRIVER_SEAT ? { ...at, driver: true } : at),
    ),
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

interface SyncedValues {
  attitude?: { trim: number; roll: number };
  icebreaker?: boolean;
}

export class SportsboatDrive implements Drive {
  private icebreakerOn: boolean;
  private readonly synced: SyncedCommands<SyncedValues>;
  private motion: MotionState;
  private readonly beachedTyres: TyreLimits;
  private dragEstimate: number | undefined;
  private trim = 0;
  private roll = 0;
  private readonly hold: Hold;
  private lastCut: LastCut | undefined;
  private readonly equipment = equipmentBindings(SPORTSBOAT_EQUIPMENT, {
    [ICEBREAKER_SWITCH_ITEM]: {
      get: () => (this.icebreakerOn ? ICEBREAKER_ON : ICEBREAKER_OFF),
      set: (state) => {
        this.icebreakerOn = state === ICEBREAKER_ON;
      },
    },
  });

  constructor(
    yaw: number,
    restored: RestoredOf<typeof SPORTSBOAT_ENTITY>,
    private readonly limits: MotionLimits = SPORTSBOAT_MOTION,
  ) {
    this.motion = initialMotion(yaw);
    this.icebreakerOn = restored.icebreaker === true;
    this.synced = new SyncedCommands<SyncedValues>()
      .add((values) => values.attitude?.trim, trimCommand)
      .add((values) => values.attitude?.roll, rollCommand)
      .add((values) => values.icebreaker, icebreakerCommand, {
        value: this.icebreakerOn,
      });
    this.hold = new Hold(restored.docked === true);
    // A beached hull has no handbrake and does not creep (beachedInput), so
    // stepMotion never reads these; the grip stands in for the handbrake grip.
    this.beachedTyres = Object.freeze({
      handbrakeGrip: limits.grip,
      creepSpeed: SPORTSBOAT_SPEC.creepSpeed,
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
    held: boolean;
    waterDrag: number | undefined;
    trim: number;
    roll: number;
  }> {
    return {
      held: this.hold.held !== undefined,
      waterDrag: this.dragEstimate,
      trim: this.trim,
      roll: this.roll,
    };
  }

  onDriverMounted(driverYaw: number): void {
    // A held hull keeps its hold yaw, so turning the drive to the driver here
    // would point the seats and headlights away from the bow until undocking.
    if (this.hold.held || this.hold.restoring) return;
    this.motion = alignOnMount(this.motion, driverYaw);
  }

  onSeatVacated(_seat: number): readonly EngineCommand[] {
    return [];
  }

  equipmentState(item: string): string | undefined {
    return this.equipment.equipmentState(item);
  }

  setEquipmentState(item: string, state: string): boolean {
    return this.equipment.setEquipmentState(item, state);
  }

  resync(): void {
    this.synced.resync();
    this.hold.resync();
  }

  step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    this.hold.beginStep();
    const hull = this.stepHull(raw, ctx);
    const icebreaker = this.synced.next({ icebreaker: this.icebreakerOn });
    const resend = this.hold.resendCommand();
    if (icebreaker.length === 0 && !resend) return hull;
    // A held step skips the attitude latches, so it resends trim and roll here too.
    return {
      ...hull,
      commands: [
        ...hull.commands,
        ...icebreaker,
        ...(resend ? [resend] : []),
        ...(resend && this.hold.held ? this.attitudeCommands() : []),
      ],
    };
  }

  private attitudeCommands(): EngineCommand[] {
    return this.synced.next({ attitude: { trim: this.trim, roll: this.roll } });
  }

  private stepHull(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    if (this.hold.restoring) {
      this.hold.adopt({ ...ctx.location, yaw: this.motion.yaw });
    }
    const commands: EngineCommand[] = [];
    let boardDeckRiders = false;
    const held = this.hold.held;
    if (held) {
      if (!pushesStick(raw)) {
        return heldStep(dockAt(held), held.yaw, ctx.deckSeatInputs);
      }
      boardDeckRiders = true;
      commands.push(...this.hold.leave());
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
        SPORTSBOAT_SPEC.creepSpeed,
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
    if (
      this.hold.observe(
        afloat &&
          raw === undefined &&
          Math.abs(step.state.speed) < SPEC.stoppedSpeed,
      )
    ) {
      const holdY = holdHeight(ctx.location.y, (dy) =>
        liquidAt({ x: 0, y: dy, z: 0 }),
      );
      if (holdY !== undefined) {
        this.motion = { ...step.state, speed: 0 };
        commands.push(
          ...this.hold.enter({
            ...ctx.location,
            y: holdY,
            yaw: step.state.yaw,
          }),
        );
      }
    }
    const holdPose = this.hold.held;
    if (holdPose) {
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
    // Buoyancy and gravity belong to the engine. The script pushes vertically only while the
    // water over the feet is deeper than surfacing.maxDepth (ADR 0175).
    return {
      impulse: {
        x: step.impulse.x,
        y: afloat ? surfaceLift(depth) : 0,
        z: step.impulse.z,
      },
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
      ...(holdPose && { dock: dockAt(holdPose) }),
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
