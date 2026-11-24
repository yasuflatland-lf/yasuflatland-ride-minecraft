import { system, world } from "@minecraft/server";
import type { PressRoom } from "../../../../../application/vehicle/room/pressRoom";
import { cellOf } from "../../../../../domain/shared/cells";
import type { Debounces } from "../../../../../domain/shared/debounce";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../../domain/shared/ids";
import type { DockLayer } from "../../../bedrock/dockLayer";
import { campingGearOfItem } from "../identifiers";

export function registerItemUse(
  room: PressRoom,
  owner: DockLayer["cellOwner"],
  handled: Debounces<PlayerId>,
): void {
  world.afterEvents.itemUse.subscribe(({ itemStack, source: player }) => {
    const item = campingGearOfItem(itemStack.typeId);
    if (!item) return;
    const playerId = asPlayerId(player.id);
    if (!handled.ready(playerId, system.currentTick)) return;
    const feet = player.location;
    const cell = cellOf(feet);
    const dimension = asDimensionId(player.dimension.id);
    const vehicleId =
      owner(dimension, cell) ?? owner(dimension, { ...cell, y: cell.y - 1 });
    if (vehicleId === undefined) return;
    const action = room.prepare({
      source: "itemUse",
      playerId,
      vehicleId,
      feet,
      eye: player.getHeadLocation(),
      direction: player.getViewDirection(),
      held: { item, hotbarSlot: player.selectedSlotIndex },
    });
    if (action) {
      handled.record(playerId, system.currentTick);
      action();
    }
  });
}
