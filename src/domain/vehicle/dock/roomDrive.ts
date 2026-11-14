import type { Vec3 } from "../../shared/vec";
import type { Drive } from "../drive";
import type {
  DecorItemId,
  DecorPlacement,
  DecorSlotId,
  StoragePress,
} from "./decor";

export interface RoomDrive {
  /** Opens or closes the door of a held vehicle's room at `tick`; false when it has none or the tap is ignored (ADR 0068, 0105). */
  useDockDoor(tick: number): boolean;
  /** The spawn cell for a press on bed block `cell` of this held vehicle; undefined when it is none of its beds (ADR 0182). */
  bedSpawnCell(cell: Vec3): Vec3 | undefined;
  /** A press on the shower-toilet of a held vehicle by a player with feet at `feet`, at `tick`: swings its door or runs its shower; false when it has none or the press is ignored (ADR 0094, 0098, 0105, 0118). */
  pressShowerToilet(feet: Vec3, tick: number): boolean;
  /** The decor of the vehicle's room, in slot order, then any stowed decor that could not occupy a slot (ADR 0093, 0103). */
  decor(): readonly DecorPlacement[];
  /** Puts `item` in `slot`, or empties it when undefined. Returns whether the decor changed (ADR 0093). */
  setDecor(slot: DecorSlotId, item: DecorItemId | undefined): boolean;
  /** The free decor slot that accepts `item`: the slot of the pressed world `cell` when it can take it, else the one nearest `point` unless `exact`, once the vehicle has parked (after its parking tick); undefined otherwise. With the player's `eye`, nearness is measured along the line of sight (ADR 0093, 0097, 0104, 0110). */
  decorSlotFor(
    item: DecorItemId,
    point: Vec3,
    cell: Vec3,
    exact: boolean,
    eye?: Vec3,
  ): DecorSlotId | undefined;
  /** A player puts `item` in `slot`; false when the vehicle is not parked or the slot is taken or does not accept it (ADR 0093). */
  placeDecor(slot: DecorSlotId, item: DecorItemId): boolean;
  /** A player takes the decor out of the slot at world `cell` while parked, the one nearest the pressed `point` (seen from `eye`) when the cell holds two; returns its item, or undefined when there is none (ADR 0093, 0108). */
  removeDecor(cell: Vec3, point?: Vec3, eye?: Vec3): DecorItemId | undefined;
  /** A player pressed storage with doors, such as the wall cabinet, at world `cell`, at `point` when known, at `tick`: opens or shuts a door, or takes an item out of an open compartment; undefined when nothing happened (ADR 0114, 0121). */
  pressStorage(
    cell: Vec3,
    point: Vec3 | undefined,
    tick: number,
    takeContents?: boolean,
  ): StoragePress | undefined;
}

export function isRoomDrive(drive: Drive): drive is Drive & RoomDrive {
  const room = drive as Partial<RoomDrive>;
  return (
    typeof room.useDockDoor === "function" &&
    typeof room.bedSpawnCell === "function" &&
    typeof room.pressShowerToilet === "function" &&
    typeof room.decor === "function" &&
    typeof room.setDecor === "function" &&
    typeof room.decorSlotFor === "function" &&
    typeof room.placeDecor === "function" &&
    typeof room.removeDecor === "function" &&
    typeof room.pressStorage === "function"
  );
}
