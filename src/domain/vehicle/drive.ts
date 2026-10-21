// How one vehicle kind moves each tick, under the shared core in vehicle.ts (ADR 0050, 0055).
import type { Vec2, Vec3 } from "../shared/vec";
import type { DecorPlacement } from "./dock/decor";
import type { ClearCell, Departure, Dock, DockRestoredKey } from "./dock/dock";
import type { RawInput } from "./driveInput";

/** Sensors and inputs from auxiliary seats. Riders, the test input and the ram query stay with the core (ADR 0083). */
export interface TickContext {
  tick: number;
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
  /**
   * Block type IDs at these world cells, in order. Air and light blocks read as
   * "minecraft:air"; a cell in an unloaded chunk reads as undefined. Drives call it
   * only on rare ticks, such as a park attempt (ADR 0063, 0068).
   */
  blockTypes(cells: readonly Vec3[]): readonly (string | undefined)[];
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
 * properties the kind's entity contract lists in `restored`, plus the dock
 * values infrastructure reads from the vehicle's dynamic properties (laid
 * cells, decor; DOCK_RESTORED, ADR 0068, 0093).
 * K narrows the keys to one kind's restored list; the default accepts any key
 * at the boundary.
 */
export type RestoredValues<K extends string = string> = Readonly<
  Partial<Record<K | DockRestoredKey, string | number | boolean>>
>;

export interface RiderState {
  thirdPerson: boolean;
  underwater: boolean;
}

export interface DriveStep {
  dock?: Dock;
  /** Blocks to remove this tick before the dock's cells are laid (ADR 0063, 0068). */
  clear?: readonly ClearCell[];
  /** Shown on the driver's action bar as the lang key yasu_ride.message.<name> (ADR 0063, 0068). */
  message?: string;
  /** Seats the players standing in these boxes this tick, or moves them to the exit (ADR 0063, 0068). */
  depart?: Departure;
  /** Moves every deck seat rider into the vehicle this tick (ADR 0063). */
  boardDeckRiders?: boolean;
  impulse: Vec3;
  /** The facing used for the ram this tick. */
  forward: Vec2;
  commands: readonly EngineCommand[];
  riders: RiderState;
}

export interface Drive {
  /** Internal forward/reverse speed in blocks/tick; negative means reverse. */
  readonly speed: number;
  readonly yaw: number;
  /** Called when a new driver takes seat 0. */
  onDriverMounted(driverYaw: number): void;
  onSeatVacated(seat: number): readonly EngineCommand[];
  /** Opens or closes the door of a held vehicle's room at `tick`; false when it has none or the tap is ignored (ADR 0068, 0105). */
  useDockDoor?(tick: number): boolean;
  /** Opens or closes the shower door of a held vehicle at `tick`; false when it has none or the tap is ignored (ADR 0094, 0105). */
  useShowerDoor?(tick: number): boolean;
  /** Runs the shower of a held vehicle for a fixed time; false when it has none (ADR 0094). */
  runShower?(): boolean;
  /** The decor of the vehicle's room, in slot order, then any stowed decor whose slot no longer exists (ADR 0103); absent for kinds without decor (ADR 0093). */
  decor?(): readonly DecorPlacement[];
  /** Puts `item` in `slot`, or empties it when undefined. Returns whether the decor changed (ADR 0093). */
  setDecor?(slot: string, item: string | undefined): boolean;
  /** The free decor slot that accepts `item`: the slot of the pressed world `cell` when it can take it, else the one nearest `point` unless `exact`, once the vehicle has parked (after its parking tick); undefined otherwise. With the player's `eye`, nearness is measured along the line of sight (ADR 0093, 0097, 0104, 0110). */
  decorSlotFor?(
    item: string,
    point: Vec3,
    cell: Vec3,
    exact: boolean,
    eye?: Vec3,
  ): string | undefined;
  /** A player puts `item` in `slot`; false when the vehicle is not parked or the slot is taken or does not accept it (ADR 0093). */
  placeDecor?(slot: string, item: string): boolean;
  /** A player takes the decor out of the slot at world `cell` while parked; returns its item, or undefined when there is none (ADR 0093). */
  removeDecor?(cell: Vec3): string | undefined;
  step(raw: RawInput | undefined, ctx: TickContext): DriveStep;
}
