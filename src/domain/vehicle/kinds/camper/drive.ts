import { clamp, type Vec3 } from "../../../shared/vec";
import { type DecorPlacement, isDecorItem, parseDecor } from "../../dock/decor";
import { type ClearCell, DOCK_RESTORED } from "../../dock/dock";
import type { HoldPose } from "../../dock/floor";
import type { DriveStep, EngineCommand, TickContext } from "../../drive";
import type { RawInput } from "../../driveInput";
import type { RestoredOf } from "../../entityContract";
import { DOCK, heldStep, pushesStick } from "../../motion/dock";
import { dockCommands, undockCommands } from "../../motion/dockEntity";
import { TransformingDrive } from "../../motion/transformingDrive";
import { SyncedValue } from "../../syncedValue";
import { type BodyEnds, guardEnds } from "./bodyGuard";
import { DECOR_SLOTS, decorSlot } from "./decor";
import { nearestFreeSlot, slotAt, slotsFor } from "./decorPlacing";
import { type CAMPER_ENTITY, doorCommand } from "./entity";
import { CAMPER_MOTION, CAMPER_TYRES } from "./profile";
import {
  cargoCells,
  deckSeats,
  decorCells,
  departure,
  exitCells,
  holdsCargo,
  isPassable,
  ownDecor,
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

// The shared transforming drivetrain with the camper's values, its end check
// (ADR 0067), and parking (ADR 0068).
export class CamperDrive extends TransformingDrive {
  private parked: HoldPose | undefined;
  private restoredDocked: boolean;
  private readonly restoredLaid: boolean;
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
  private readonly doorStepSync = new SyncedValue<number>();
  private readonly decorBySlot = new Map<string, string>();

  constructor(yaw: number, restored: RestoredOf<typeof CAMPER_ENTITY>) {
    super(
      yaw,
      restored,
      CAMPER_TRANSFORMING,
      CAMPER_MOTION,
      CAMPER_TYRES,
      (step, ctx, form) => guardEnds(step, ctx, CAMPER_ENDS, form),
    );
    this.restoredDocked = restored.docked === true;
    this.restoredLaid = restored[DOCK_RESTORED.laid] === true;
    const door = typeof restored.door === "number" ? restored.door : 0;
    this.doorStep = this.restoredDocked
      ? clamp(Math.round(door * DOOR_STEPS), 0, DOOR_STEPS)
      : 0;
    const savedTarget = restored[DOCK_RESTORED.doorOpen];
    this.doorOpen =
      this.restoredDocked && typeof savedTarget === "boolean"
        ? savedTarget
        : this.doorStep * 2 >= DOOR_STEPS;
    // Decor survives driving: it is restored whether or not the camper was docked (ADR 0093).
    for (const { slot, item } of parseDecor(restored[DOCK_RESTORED.decor]))
      if (decorSlot(slot)) this.decorBySlot.set(slot, item);
  }

  /**
   * The transforming drive's snapshot plus whether the camper is parked, for
   * unit tests only. Production code must not call it.
   */
  override inspect(): Readonly<{
    wheelsDown: boolean;
    bank: number;
    parked: boolean;
  }> {
    return { ...super.inspect(), parked: this.parked !== undefined };
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

  decor(): readonly DecorPlacement[] {
    return DECOR_SLOTS.flatMap(({ id }) => {
      const item = this.decorBySlot.get(id);
      return item === undefined ? [] : [{ slot: id, item }];
    });
  }

  setDecor(slot: string, item: string | undefined): boolean {
    if (!decorSlot(slot) || (item !== undefined && !isDecorItem(item)))
      return false;
    if (this.decorBySlot.get(slot) === item) return false;
    if (item === undefined) this.decorBySlot.delete(slot);
    else this.decorBySlot.set(slot, item);
    return true;
  }

  // No roomLaid check: parkedStep sets it on the parking tick itself, so it is
  // always true between steps while parked, and decor placed now is laid with
  // the room on the next step (ADR 0068, 0093).
  decorSlotFor(item: string, point: Vec3): string | undefined {
    if (!this.parked) return undefined;
    return nearestFreeSlot(this.parked, item, this.decor(), point)?.id;
  }

  placeDecor(slot: string, item: string): boolean {
    if (
      !this.parked ||
      this.decorBySlot.has(slot) ||
      !slotsFor(item).some((s) => s.id === slot)
    )
      return false;
    return this.setDecor(slot, item);
  }

  removeDecor(cell: Vec3): string | undefined {
    if (!this.parked) return undefined;
    const slot = slotAt(this.parked, cell);
    const item = slot ? this.decorBySlot.get(slot.id) : undefined;
    if (!slot || item === undefined) return undefined;
    this.setDecor(slot.id, undefined);
    return item;
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
      const decor = decorCells(parked, this.decor());
      const cargo = cargoCells(parked, this.decor());
      // The cargo cells, the decor cells, and the two exit cells share one
      // departure batch; a decor cell is clear only with air or its own decor block.
      const types = ctx.blockTypes([
        ...cargo,
        ...decor.map(({ x, y, z }) => ({ x, y, z })),
        ...exitCells(parked),
      ]);
      const decorTypes = types.slice(cargo.length, cargo.length + decor.length);
      if (
        holdsCargo(types.slice(0, cargo.length)) ||
        decor.some(
          (c, i) =>
            c.block.type === "decor" && !ownDecor(decorTypes[i], c.block.item),
        )
      )
        return {
          ...this.parkedStep(parked, ctx),
          message: PARK_MESSAGES.clearCargo,
        };
      return this.depart(
        parked,
        raw,
        ctx,
        types.slice(cargo.length + decor.length).every(isPassable),
      );
    }
    const step = super.step(raw, ctx);
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
    const dock = {
      hold: pose,
      cells: lay
        ? [...roomCells(pose, this.doorOpen), ...decorCells(pose, this.decor())]
        : [],
      seats: deckSeats(pose),
    };
    return heldStep(dock, pose.yaw, ctx.deckSeatInputs, {
      commands: this.doorCommands(),
      clear,
    });
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
    const step = this.doorStepSync.next(this.doorStep);
    return step === undefined ? [] : [doorCommand(step / DOOR_STEPS)];
  }
}
