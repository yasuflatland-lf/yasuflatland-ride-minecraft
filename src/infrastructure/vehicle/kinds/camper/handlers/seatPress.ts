import { system, world } from "@minecraft/server";
import type { PressRoom } from "../../../../../application/vehicle/room/pressRoom";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../../domain/shared/ids";
import {
  SeatPresses,
  seatSlotCell,
} from "../../../../../domain/vehicle/kinds/index";
import type { DockLayer } from "../../../bedrock/dockLayer";
import { DECK_SEAT_TYPE } from "../../../bedrock/identifiers";
import {
  CAMPER_FURNITURE_BLOCK,
  campingGearOfItem,
  isDecorBlock,
} from "../identifiers";

export function registerSeatPress(
  room: PressRoom,
  owner: DockLayer["cellOwner"],
): void {
  const presses = new SeatPresses<PlayerId>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const seat = ev.target;
    const item = campingGearOfItem(ev.itemStack?.typeId);
    if (!item || seat.typeId !== DECK_SEAT_TYPE) return;
    const point = seat.location;
    const cell = seatSlotCell(point, (at) => {
      const typeId = seat.dimension.getBlock(at)?.typeId;
      return (
        typeId !== undefined &&
        (typeId === CAMPER_FURNITURE_BLOCK || isDecorBlock(typeId))
      );
    });
    if (!cell) return;
    const vehicleId = owner(asDimensionId(seat.dimension.id), cell);
    if (vehicleId === undefined) return;
    // A gear press on an occupied slot must still prevent the player from sitting (ADR 0104).
    ev.cancel = true;
    const playerId = asPlayerId(ev.player.id);
    if (!presses.press(system.currentTick, playerId)) return;
    const action = room.prepare({
      source: "seat",
      playerId,
      vehicleId,
      cell,
      point,
      held: { item, hotbarSlot: ev.player.selectedSlotIndex },
    });
    if (action) system.run(action);
  });
}
