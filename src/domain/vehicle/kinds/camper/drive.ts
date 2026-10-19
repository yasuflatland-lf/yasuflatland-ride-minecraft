import { clamp, forward } from "../../../shared/vec";
import { type ClearCell, DOCK_RESTORED } from "../../dock";
import type {
  DriveStep,
  EngineCommand,
  RestoredValues,
  TickContext,
} from "../../drive";
import type { RawInput } from "../../driveInput";
import type { HoldPose } from "../../floor";
import { DOCK, pushesStick } from "../../motion/dock";
import { TransformingDrive } from "../../motion/transformingDrive";
import { type BodyEnds, guardEnds } from "./bodyGuard";
import { dockCommands, doorCommand, undockCommands } from "./entity";
import { CAMPER_MOTION } from "./profile";
import {
  cargoCells,
  deckSeats,
  departure,
  exitCells,
  holdsCargo,
  isPassable,
  PARK_MESSAGES,
  parkCheckCells,
  parkDecorations,
  parkPose,
  planPark,
  roomCells,
  wallFootCells,
} from "./room";
import { CAMPER_SPEC, CAMPER_TRANSFORMING } from "./spec";

const CAMPER_ENDS: BodyEnds = {
  front: CAMPER_SPEC.bodyFront,
  rear: CAMPER_SPEC.bodyRear,
  halfWidth: CAMPER_SPEC.bodyHalfWidth,
  height: CAMPER_SPEC.carHeight,
};

// The door swings in 10 steps of 0.1, one per tick: half a second (ADR 0068).
const DOOR_STEPS = 10;
const AT_REST = { x: 0, y: 0, z: 0 } as const;

// The shared transforming drivetrain with the camper's values, its end check
// (ADR 0067), and parking (ADR 0068).
export class CamperDrive extends TransformingDrive {
  private parked: HoldPose | undefined;
  private restoredDocked: boolean;
  private readonly restoredLaid: boolean;
  private restoreCollision: boolean;
  // False on the parking tick: its teleport and dock event take effect only at
  // the end of the tick, and a floor laid under a body that still collides would
  // push it up (ADR 0068).
  private roomLaid = false;
  private pendingClear: readonly ClearCell[] = [];
  private stillTicks = 0;
  private parkTried = false;
  private stickWasPushed = false;
  private doorOpen: boolean;
  private doorStep: number;
  // Undefined until the first tick, so a rebuilt vehicle re-sends its door, as with the bank.
  private sentDoorStep: number | undefined;

  constructor(yaw: number, restored: RestoredValues) {
    super(
      yaw,
      restored,
      CAMPER_TRANSFORMING,
      CAMPER_MOTION,
      (step, ctx, form) => guardEnds(step, ctx, CAMPER_ENDS, form),
    );
    this.restoredDocked = restored.docked === true;
    this.restoredLaid = restored[DOCK_RESTORED.laid] === true;
    // Undock also restores gravity; weightless forms must keep their physics group.
    this.restoreCollision = !this.restoredDocked && this.form === "car";
    const door = typeof restored.door === "number" ? restored.door : 0;
    this.doorStep = this.restoredDocked
      ? clamp(Math.round(door * DOOR_STEPS), 0, DOOR_STEPS)
      : 0;
    const savedTarget = restored[DOCK_RESTORED.doorOpen];
    this.doorOpen =
      this.restoredDocked && typeof savedTarget === "boolean"
        ? savedTarget
        : this.doorStep * 2 >= DOOR_STEPS;
  }

  get isParked(): boolean {
    return this.parked !== undefined;
  }

  override onDriverMounted(driverYaw: number): void {
    // A parked body keeps its snapped yaw, so its room, seats, and headlights stay put.
    if (this.parked || this.restoredDocked) return;
    super.onDriverMounted(driverYaw);
  }

  useDockDoor(): boolean {
    if (!this.parked) return false;
    this.doorOpen = !this.doorOpen;
    return true;
  }

  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    if (this.restoredDocked) {
      this.restoredDocked = false;
      const pose = parkPose(ctx.location, this.yaw);
      this.park(
        pose,
        this.restoredLaid ? [] : (this.clearForPark(pose, ctx, true) ?? []),
      );
      // A docked entity already has no collision, so recovery may clear and lay together.
      this.roomLaid = true;
      if (!this.restoredLaid) return this.parkedStep(pose, ctx);
    }
    const pushed = pushesStick(raw);
    const pressed = pushed && !this.stickWasPushed;
    this.stickWasPushed = pushed;
    const parked = this.parked;
    if (parked) {
      if (!pressed) return this.parkedStep(parked, ctx);
      const cargo = cargoCells(parked);
      // The 63 cargo cells and two exit cells share one departure batch.
      const types = ctx.blockTypes([...cargo, ...exitCells(parked)]);
      if (holdsCargo(types.slice(0, cargo.length)))
        return {
          ...this.parkedStep(parked, ctx),
          message: PARK_MESSAGES.clearCargo,
        };
      return this.depart(
        parked,
        raw,
        ctx,
        types.slice(cargo.length).every(isPassable),
      );
    }
    let step = super.step(raw, ctx);
    if (this.restoreCollision) {
      this.restoreCollision = false;
      step = { ...step, commands: [...undockCommands(), ...step.commands] };
    }
    const still =
      this.form === "car" &&
      ctx.onGround &&
      !pushed &&
      Math.abs(this.speed) < DOCK.maxSpeed;
    if (!still) {
      this.stillTicks = 0;
      this.parkTried = false;
      return this.withDoor(step);
    }
    this.stillTicks = Math.min(this.stillTicks + 1, DOCK.ticks);
    if (this.stillTicks < DOCK.ticks || this.parkTried)
      return this.withDoor(step);
    this.parkTried = true;
    const pose = parkPose(ctx.location, this.yaw);
    const clear = this.clearForPark(pose, ctx);
    if (!clear)
      return { ...this.withDoor(step), message: PARK_MESSAGES.cannotPark };
    this.park(pose, clear);
    const held = this.parkedStep(pose, ctx);
    return {
      ...held,
      commands: [...step.commands, ...dockCommands(), ...held.commands],
    };
  }

  private clearForPark(
    pose: HoldPose,
    ctx: TickContext,
    recovering = false,
  ): ClearCell[] | undefined {
    const cells = parkCheckCells(pose);
    const feet = wallFootCells(pose);
    const types = ctx.blockTypes([...cells, ...feet]);
    return (recovering ? parkDecorations : planPark)(
      cells,
      types.slice(0, cells.length),
      feet,
      types.slice(cells.length),
    );
  }

  private park(pose: HoldPose, clear: readonly ClearCell[]): void {
    this.parked = pose;
    this.pendingClear = clear;
    this.roomLaid = false;
    this.stillTicks = 0;
    this.parkTried = false;
    this.restartAt(pose.yaw);
  }

  private parkedStep(pose: HoldPose, ctx: TickContext): DriveStep {
    const lay = this.roomLaid;
    const clear = lay ? this.pendingClear : [];
    if (lay) this.pendingClear = [];
    this.roomLaid = true;
    return {
      dock: {
        hold: pose,
        cells: lay ? roomCells(pose, this.doorOpen) : [],
        seats: deckSeats(pose),
      },
      clear,
      boardDeckRiders: pushesStick(ctx.deckSeatInputs[0]),
      impulse: AT_REST,
      forward: forward(pose.yaw),
      commands: this.doorCommands(),
      riders: { thirdPerson: false, underwater: false },
    };
  }

  private depart(
    pose: HoldPose,
    raw: RawInput | undefined,
    ctx: TickContext,
    exitClear: boolean,
  ): DriveStep {
    this.parked = undefined;
    this.pendingClear = [];
    this.doorOpen = false;
    this.doorStep = 0;
    const step = super.step(raw, ctx);
    return {
      ...step,
      commands: [...undockCommands(), ...this.doorCommands(), ...step.commands],
      boardDeckRiders: true,
      depart: departure(pose, exitClear),
    };
  }

  private withDoor(step: DriveStep): DriveStep {
    const door = this.doorCommands();
    return door.length === 0
      ? step
      : { ...step, commands: [...step.commands, ...door] };
  }

  private doorCommands(): EngineCommand[] {
    const target = this.doorOpen ? DOOR_STEPS : 0;
    this.doorStep += Math.sign(target - this.doorStep);
    if (this.doorStep === this.sentDoorStep) return [];
    this.sentDoorStep = this.doorStep;
    return [doorCommand(this.doorStep / DOOR_STEPS)];
  }
}
