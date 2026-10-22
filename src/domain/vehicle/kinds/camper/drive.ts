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
import {
  cellSlots,
  cellTaken,
  DECOR_CELLS,
  DECOR_SLOTS,
  decorInCell,
  decorSlot,
  savedSlotId,
} from "./decor";
import { slotForPress, slotsAt, slotsFor } from "./decorPlacing";
import { DoorToggle } from "./doorToggle";
import {
  type CAMPER_ENTITY,
  doorCommand,
  showerCommand,
  showerDoorCommand,
} from "./entity";
import { CAMPER_MOTION, CAMPER_TYRES } from "./profile";
import {
  cargoCells,
  deckSeats,
  decorCells,
  departure,
  exitCells,
  furnitureCells,
  holdsCargo,
  isPassable,
  ownSlotBlock,
  PARK_MESSAGES,
  parkCheckCells,
  parkDecorations,
  parkPose,
  planPark,
  roomCells,
  slotCells,
  wallFootCells,
} from "./room";
import { CAMPER_SPEC, CAMPER_TRANSFORMING } from "./spec";

const CAMPER_ENDS: BodyEnds = {
  front: CAMPER_SPEC.bodyFront,
  rear: CAMPER_SPEC.bodyRear,
  halfWidth: CAMPER_SPEC.bodyHalfWidth,
  height: CAMPER_SPEC.carHeight,
};

// The door swings one step per tick (ADR 0068).
const DOOR_STEPS = CAMPER_SPEC.doorSwingTicks;

/** A door's swing restored in DOOR_STEPS; a camper that was not docked starts with it shut. */
function restoredDoorStep(open: unknown, docked: boolean): number {
  if (!docked || typeof open !== "number") return 0;
  return clamp(Math.round(open * DOOR_STEPS), 0, DOOR_STEPS);
}

/** Moves a door one step toward open or shut. */
function swing(step: number, open: boolean): number {
  return step + Math.sign((open ? DOOR_STEPS : 0) - step);
}

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
  private readonly doorToggle = new DoorToggle();
  private doorStep: number;
  private readonly doorStepSync = new SyncedValue<number>();
  // The shower door swings in the entry door's DOOR_STEPS (ADR 0094).
  private showerDoorOpen: boolean;
  private readonly showerDoorToggle = new DoorToggle();
  private showerDoorStep: number;
  private readonly showerDoorStepSync = new SyncedValue<number>();
  private showerTicks = 0;
  private readonly showerSync = new SyncedValue<boolean>();
  private readonly decorBySlot = new Map<string, string>();
  // Saved decor whose slot no longer exists and that no free slot could take; it is
  // kept, saved, and given back when the camper breaks (ADR 0103).
  private readonly stowedDecor: DecorPlacement[] = [];

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
    this.doorStep = restoredDoorStep(restored.door, this.restoredDocked);
    const savedTarget = restored[DOCK_RESTORED.doorOpen];
    this.doorOpen =
      this.restoredDocked && typeof savedTarget === "boolean"
        ? savedTarget
        : this.doorStep * 2 >= DOOR_STEPS;
    // Decor survives driving: it is restored whether or not the camper was docked (ADR 0093).
    // An entry whose slot no longer exists, or whose cell an earlier entry already holds,
    // moves to the first free slot that takes its item, or is stowed (ADR 0103, 0105). Decor
    // saved in a renamed slot loads as if saved in its new one (ADR 0112).
    const saved = parseDecor(restored[DOCK_RESTORED.decor]).map((entry) => ({
      ...entry,
      slot: savedSlotId(entry.slot),
    }));
    const homeless: DecorPlacement[] = [];
    for (const entry of saved) {
      const slot = decorSlot(entry.slot);
      if (slot && !cellTaken(slot, this.placed()))
        this.decorBySlot.set(slot.id, entry.item);
      else homeless.push(entry);
    }
    for (const entry of homeless) {
      const free = slotsFor(entry.item).find(
        (slot) => !cellTaken(slot, this.placed()),
      );
      if (free) this.decorBySlot.set(free.id, entry.item);
      else this.stowedDecor.push(entry);
    }
    this.showerDoorStep = restoredDoorStep(
      restored.shower_door,
      this.restoredDocked,
    );
    this.showerDoorOpen = this.showerDoorStep * 2 >= DOOR_STEPS;
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

  useDockDoor(tick: number): boolean {
    if (!this.parked || !this.doorToggle.tryToggle(tick)) return false;
    this.doorOpen = !this.doorOpen;
    return true;
  }

  useShowerDoor(tick: number): boolean {
    if (!this.parked || !this.showerDoorToggle.tryToggle(tick)) return false;
    this.showerDoorOpen = !this.showerDoorOpen;
    return true;
  }

  runShower(): boolean {
    if (!this.parked) return false;
    this.showerTicks = CAMPER_SPEC.showerTicks;
    return true;
  }

  decor(): readonly DecorPlacement[] {
    return [...this.placed(), ...this.stowedDecor];
  }

  // The decor in slots, without the stowed entries: a stowed entry may name a slot whose
  // cell another entry holds, and it is neither laid nor counted as taking that cell.
  private placed(): DecorPlacement[] {
    return DECOR_SLOTS.flatMap(({ id }) => {
      const item = this.decorBySlot.get(id);
      return item === undefined ? [] : [{ slot: id, item }];
    });
  }

  /** Sets or clears one slot; an item replaces whatever another slot of its cell held (ADR 0107). */
  setDecor(slot: string, item: string | undefined): boolean {
    const target = decorSlot(slot);
    if (!target || (item !== undefined && !isDecorItem(item))) return false;
    if (this.decorBySlot.get(slot) === item) return false;
    if (item === undefined) {
      this.decorBySlot.delete(slot);
      return true;
    }
    for (const other of cellSlots(target.cell))
      this.decorBySlot.delete(other.id);
    this.decorBySlot.set(slot, item);
    return true;
  }

  // No roomLaid check: parkedStep sets it on the parking tick itself, so it is
  // always true between steps while parked, and decor placed now is laid with
  // the room on the next step (ADR 0068, 0093).
  decorSlotFor(
    item: string,
    point: Vec3,
    cell: Vec3,
    exact: boolean,
    eye?: Vec3,
  ): string | undefined {
    if (!this.parked) return undefined;
    return slotForPress(
      this.parked,
      item,
      this.placed(),
      cell,
      point,
      exact,
      eye,
    )?.id;
  }

  placeDecor(slot: string, item: string): boolean {
    const target = slotsFor(item).find((s) => s.id === slot);
    if (!this.parked || !target || cellTaken(target, this.placed()))
      return false;
    return this.setDecor(slot, item);
  }

  /** Takes back the item in the pressed cell, whichever of the cell's slots holds it (ADR 0107). */
  removeDecor(cell: Vec3): string | undefined {
    if (!this.parked) return undefined;
    const slot = slotsAt(this.parked, cell).find(({ id }) =>
      this.decorBySlot.has(id),
    );
    if (!slot) return undefined;
    const item = this.decorBySlot.get(slot.id);
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
      const cargo = cargoCells(parked);
      const slots = slotCells(parked);
      // The cargo cells, the slot cells, and the two exit cells share one departure
      // batch; a slot cell is clear only with air, its furniture block, or its own decor (ADR 0093, 0097, 0105).
      const types = ctx.blockTypes([...cargo, ...slots, ...exitCells(parked)]);
      const slotTypes = types.slice(cargo.length, cargo.length + slots.length);
      const decor = this.placed();
      if (
        holdsCargo(types.slice(0, cargo.length)) ||
        DECOR_CELLS.some(
          ({ cell }, i) =>
            !ownSlotBlock(slotTypes[i], decorInCell(cell, decor)?.item),
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
        types.slice(cargo.length + slots.length).every(isPassable),
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
      return this.withProperties(step);
    }
    this.stillTicks = Math.min(this.stillTicks + 1, DOCK.ticks);
    if (this.stillTicks < DOCK.ticks || this.parkTried)
      return this.withProperties(step);
    this.parkTried = true;
    const pose = parkPose(ctx.location, this.yaw);
    const clear = this.clearForPark(pose, ctx);
    if (!clear)
      return {
        ...this.withProperties(step),
        message: PARK_MESSAGES.cannotPark,
      };
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
        ? [
            ...roomCells(pose, this.doorOpen),
            ...decorCells(pose, this.placed()),
            ...furnitureCells(pose, this.placed()),
          ]
        : [],
      seats: deckSeats(pose),
    };
    return heldStep(dock, pose.yaw, ctx.deckSeatInputs, {
      commands: this.propertyCommands(),
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
    this.showerDoorOpen = false;
    this.showerDoorStep = 0;
    this.showerTicks = 0;
    const step = super.step(raw, ctx);
    return {
      ...step,
      commands: [
        ...undockCommands(),
        ...this.propertyCommands(),
        ...step.commands,
      ],
      boardDeckRiders: true,
      depart: departure(pose, exitClear),
    };
  }

  private withProperties(step: DriveStep): DriveStep {
    const properties = this.propertyCommands();
    return properties.length === 0
      ? step
      : { ...step, commands: [...step.commands, ...properties] };
  }

  private doorCommands(): EngineCommand[] {
    this.doorStep = swing(this.doorStep, this.doorOpen);
    const step = this.doorStepSync.next(this.doorStep);
    return step === undefined ? [] : [doorCommand(step / DOOR_STEPS)];
  }

  private propertyCommands(): EngineCommand[] {
    return [...this.doorCommands(), ...this.showerCommands()];
  }

  private showerCommands(): EngineCommand[] {
    this.showerDoorStep = swing(this.showerDoorStep, this.showerDoorOpen);
    const door = this.showerDoorStepSync.next(this.showerDoorStep);
    const running = this.showerSync.next(this.showerTicks > 0);
    this.showerTicks = Math.max(this.showerTicks - 1, 0);
    return [
      ...(door === undefined ? [] : [showerDoorCommand(door / DOOR_STEPS)]),
      ...(running === undefined ? [] : [showerCommand(running)]),
    ];
  }
}
