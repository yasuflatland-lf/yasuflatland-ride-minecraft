// How one vehicle kind moves each tick, under the shared core in vehicle.ts (ADR 0050, 0055).

import type { Cell } from "../shared/cells";
import type { Vec2, Vec3 } from "../shared/vec";
import type { CapabilityKey } from "./capability";
import type { CutColumn } from "./cut";
import type { ClearCell, Departure, Dock } from "./dock/dock";
import type { RawInput } from "./driveInput";
import type { EquipmentSwitch } from "./equipment/equipment";
import type { Pave } from "./pave";

/** Sensors and inputs from auxiliary seats. Riders, the test input and the ram query stay with the core (ADR 0083). */
export interface TickContext {
  tick: number;
  /** Type ID of the block the driver's selected item places as itself, or the test value when there is no driver; undefined for an empty hand or an item that names no block. The core sets it from RiderHeld.block (ADR 0181). */
  readonly heldBlock?: string;
  deckSeatInputs: readonly (RawInput | undefined)[];
  /** Entity feet in world coordinates. */
  location: Vec3;
  /** Engine velocity in blocks/tick. */
  velocity: Vec3;
  onGround: boolean;
  /** Whether the block at entity location + offset (world axes, y from the feet) is solid; air, liquids and blocks without a collision box (flowers, grass, carpets) are not (ADR 0035). */
  solidAt(offset: Vec3): boolean;
  /** Water, flowing water, bubble columns, or waterlogged blocks at floor(location + offset). */
  waterAt(offset: Vec3): boolean;
  /** Lava or flowing lava at floor(location + offset). */
  lavaAt?(offset: Vec3): boolean;
  /**
   * Block type IDs at these world cells, in order. Air and light blocks read as
   * "minecraft:air"; a cell in an unloaded chunk reads as undefined. Drives call it
   * only on rare ticks, such as a park attempt (ADR 0063, 0068).
   */
  blockTypes(cells: readonly Vec3[]): readonly (string | undefined)[];
  /** Checks the observed block type against this vehicle's recorded dock cell (ADR 0096). */
  ownsLaidBlock?(cell: Cell, typeId: string): boolean;
  /**
   * True while the core waits for a passenger to move into seat 0 after the
   * driver left (ADR 0078). The drive then has no input but stays controlled.
   */
  readonly awaitingDriver?: boolean;
}

export type EngineCommand =
  | { type: "setProperty"; name: string; value: number | boolean | string }
  | { type: "triggerEvent"; name: string }
  | { type: "playAnimation"; name: string }
  | { type: "playSound"; name: string }; // at the vehicle's location

/**
 * Values read back when an aggregate is rebuilt (ADR 0021, 0055): the entity
 * properties the kind's contract lists, plus any values the kind's
 * infrastructure reader adds. The default accepts any key at the boundary.
 */
export type RestoredValues<K extends string = string> = Readonly<
  Partial<Record<K, string | number | boolean>>
>;

export interface RiderState {
  thirdPerson: boolean;
  underwater: boolean;
}

export interface DriveStep {
  /** The rider lean level this tick, positive to the left; absent means upright (ADR 0250). */
  readonly riderLean?: number;
  dock?: Dock;
  /** Blocks to remove this tick before the dock's cells are laid (ADR 0063, 0068). */
  clear?: readonly ClearCell[];
  /** Block columns to clear this tick, right after `clear` (ADR 0137). */
  cut?: readonly CutColumn[];
  /** Road blocks to lay this tick, after cut and before the move (ADR 0181). */
  pave?: Pave;
  /** Shown on the driver's action bar as the lang key yasu_ride.message.<name> (ADR 0063, 0068). */
  message?: string;
  /** Seats the players standing in these boxes this tick, or moves them to the exit (ADR 0063, 0068). */
  depart?: Departure;
  /** Moves every deck seat rider into the vehicle this tick (ADR 0063). */
  boardDeckRiders?: boolean;
  impulse: Vec3;
  /** The facing used for the ram this tick. */
  forward: Vec2;
  /** Half width of the ram box this tick; absent = the profile's body.halfWidth. The core clamps it to ramHalfWidthLimit(profile) (ADR 0006, 0180). */
  ramHalfWidth?: number;
  commands: readonly EngineCommand[];
  riders: RiderState;
}

export interface Drive {
  capability?<T>(key: CapabilityKey<T>): T | undefined;
  /** Item IDs returned to the player on hand take-back (ADR 0220). */
  cargo?(): readonly string[];
  /** Forgets which entity values were sent, so the next step sends all of them again; called when a tick's commands may not have reached the entity. */
  resync(): void;
  /** Internal forward/reverse speed in blocks/tick; negative means reverse. */
  readonly speed: number;
  readonly yaw: number;
  /** Called when a new driver takes seat 0. */
  onDriverMounted(driverYaw: number): void;
  onSeatVacated(seat: number): readonly EngineCommand[];
  /** Called before `step` for each seat a newly boarded rider takes this tick, ascending; its commands go into `finalCommands` after the vacated seats' commands. Absent means none. */
  onSeatTaken?(seat: number): readonly EngineCommand[];
  /** Advances a switch of this kind in its declared state order (ADR 0171). */
  cycleEquipment?(equipmentSwitch: EquipmentSwitch): boolean;
  /** Sets a declared state for the server-only test hook (ADR 0171). */
  forceEquipment?(equipmentSwitch: EquipmentSwitch, state: string): boolean;
  /** The current state of a supported switch (ADR 0139). */
  equipmentState?<S extends string>(
    equipmentSwitch: EquipmentSwitch<S>,
  ): S | undefined;
  step(raw: RawInput | undefined, ctx: TickContext): DriveStep;
}
