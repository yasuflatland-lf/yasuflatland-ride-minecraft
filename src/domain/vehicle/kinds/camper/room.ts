import type { Vec3 } from "../../../shared/vec";
import { capabilityKey } from "../../capability";
import type {
  DecorItemId,
  DecorPlacement,
  DecorSlotId,
  StoragePress,
} from "./decorData";

export interface RoomPress {
  readonly cell: Vec3;
  readonly point?: Vec3;
  readonly eye?: Vec3;
  readonly feet?: Vec3;
  readonly direction?: Vec3;
}

export interface DecorPress extends RoomPress {
  readonly point: Vec3;
}

export type DecorFallback = "nearestFree" | "none";

// An itemUse view ray has no pressed block.
export interface DrawerRayPress extends Partial<RoomPress> {
  readonly eye: Vec3;
  readonly direction: Vec3;
}

export interface StoragePressRequest extends RoomPress {
  readonly tick: number;
  readonly takeContents?: boolean;
  readonly openOnly?: boolean;
  /** Set only for a side face of the drawers block itself; rerouted floor presses use the ray. */
  readonly drawersSideFace?: boolean;
}

export interface DrawerTarget {
  readonly cell: Vec3;
  readonly point: Vec3;
  readonly slot?: DecorSlotId;
  readonly open: boolean;
  readonly floorFootprint?: boolean;
}

interface RoomDecorHost {
  /** The decor of the vehicle's room, in slot order, then any stowed decor that could not occupy a slot (ADR 0093, 0103). */
  decor(): readonly DecorPlacement[];
  /** Puts `item` in `slot`, or empties it when undefined. Returns whether the decor changed (ADR 0093). */
  setDecor(slot: DecorSlotId, item: DecorItemId | undefined): boolean;
  /**
   * While parked, prefer a free accepting slot in the pressed cell. With "nearestFree",
   * other cells are eligible when the pressed cell has no such slot. The player's eye
   * supplies the line of sight for ranking slots (ADR 0093, 0097, 0104, 0110).
   */
  decorSlotFor(
    item: DecorItemId,
    press: DecorPress,
    fallback: DecorFallback,
  ): DecorSlotId | undefined;
  /** A player puts `item` in `slot`; false when the vehicle is not parked or the slot is taken or does not accept it (ADR 0093). */
  placeDecor(slot: DecorSlotId, item: DecorItemId): boolean;
  /** A player takes the decor out of the slot at world `cell` while parked, the one nearest the pressed `point` (seen from `eye`) when the cell holds two; returns its item, or undefined when there is none (ADR 0093, 0108). */
  removeDecor(press: RoomPress): DecorItemId | undefined;
}

export interface RoomStorageHost {
  /** Read-only drawer routing for block presses and itemUse rays. */
  drawerTarget(
    press: DrawerRayPress,
    item?: DecorItemId,
  ): DrawerTarget | undefined;
  /** A player pressed storage with doors, such as the wall cabinet, at world `cell`, at `point` when known, at `tick`: opens or shuts a door, or takes an item out of an open compartment; undefined when nothing happened (ADR 0114, 0121). */
  pressStorage(request: StoragePressRequest): StoragePress | undefined;
}

interface RoomFixturesHost {
  /**
   * Every use by a player away from the wheel restarts the idle time (ADR 0024).
   * After SPEC.headlightSwitchCooldown idle ticks, feet inside the parked room can switch the lights (ADR 0115).
   */
  switchCeilingLights(feet: Vec3, tick: number): boolean;
  /** Read-only reach check for block presses, independent of the cooldown. */
  ceilingLightsReachable(feet: Vec3): boolean;
  /** Opens or closes the door of a held vehicle's room at `tick`; false when it has none or the tap is ignored (ADR 0068, 0105). */
  useDockDoor(tick: number): boolean;
  /** The spawn cell for a press on bed block `cell` of this held vehicle; undefined when it is none of its beds (ADR 0182). */
  bedSpawnCell(cell: Vec3): Vec3 | undefined;
  /** A press on the shower-toilet of a held vehicle by a player with feet at `feet`, at `tick`: swings its door or runs its shower; false when it has none or the press is ignored (ADR 0094, 0098, 0105, 0118). */
  pressShowerToilet(feet: Vec3, tick: number): boolean;
}

export interface CamperRoom {
  readonly decor: RoomDecorHost;
  readonly storage: RoomStorageHost;
  readonly fixtures: RoomFixturesHost;
}

export const CAMPER_ROOM = capabilityKey<CamperRoom>("camper_room");
