import { system, world } from "@minecraft/server";
import type { PlaceDecor } from "../../../../application/vehicle/placeDecor";
import type { RemoveDecor } from "../../../../application/vehicle/removeDecor";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import {
  CAMPER_DECOR_COMPONENT,
  campingGearOfDecorBlock,
  campingGearOfItem,
  isCamperRoomBlock,
} from "../identifiers";

export function registerDecor(
  place: PlaceDecor,
  remove: RemoveDecor,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
): void {
  // Placing listens to the before event because most room blocks have no custom
  // component. Every repeat of a long-press is cancelled too, so a held gear item
  // never opens the door or sleeps in the bed (ADR 0093).
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const item = campingGearOfItem(ev.itemStack?.typeId);
    const { block } = ev;
    if (
      item === undefined ||
      !(
        isCamperRoomBlock(block.typeId) ||
        campingGearOfDecorBlock(block.typeId) !== undefined
      )
    )
      return;
    const vehicleId = dockCellOwner(
      asDimensionId(block.dimension.id),
      block.location,
    );
    if (vehicleId === undefined) return;
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    // faceLocation is relative to the block's bottom north-west corner.
    const point = {
      x: block.location.x + ev.faceLocation.x,
      y: block.location.y + ev.faceLocation.y,
      z: block.location.z + ev.faceLocation.z,
    };
    const playerId = asPlayerId(ev.player.id);
    const hotbarSlot = ev.player.selectedSlotIndex;
    // Before events cannot change the world, so the item is taken on the next tick.
    system.run(() =>
      place.execute({ playerId, vehicleId, item, point, hotbarSlot }),
    );
  });
  // Removing goes through the decor block's custom component, like the room door (ADR 0068, 0093).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(CAMPER_DECOR_COMPONENT, {
      onPlayerInteract: (ev) => {
        const player = ev.player;
        if (!player) return;
        const held = player
          .getComponent("minecraft:inventory")
          ?.container?.getItem(player.selectedSlotIndex);
        if (held) return;
        const vehicleId = dockCellOwner(
          asDimensionId(ev.dimension.id),
          ev.block.location,
        );
        if (vehicleId)
          remove.execute({
            playerId: asPlayerId(player.id),
            vehicleId,
            cell: ev.block.location,
          });
      },
    });
  });
}
