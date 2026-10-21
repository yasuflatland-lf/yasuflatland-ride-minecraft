import {
  type PlayerInteractWithBlockBeforeEvent,
  system,
  world,
} from "@minecraft/server";
import type { PlaceDecor } from "../../../../application/vehicle/placeDecor";
import type { RemoveDecor } from "../../../../application/vehicle/removeDecor";
import type { TapDockFloor } from "../../../../application/vehicle/tapDockFloor";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import {
  CAMPER_DECOR_COMPONENT,
  CAMPER_FLOOR_BLOCK,
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
  floor: TapDockFloor,
): void {
  // Placing listens to the before event because most room blocks have no custom
  // component. Every repeat of a long-press is cancelled too, so a held gear item
  // never opens the door or sleeps in the bed (ADR 0093).
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const item = campingGearOfItem(ev.itemStack?.typeId);
    if (item === undefined) tapFloor(ev, floor);
    else placeGear(ev, item, place, dockCellOwner);
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

function placeGear(
  ev: PlayerInteractWithBlockBeforeEvent,
  item: string,
  place: PlaceDecor,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
): void {
  const { block } = ev;
  if (
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
}

// The shower-toilet is drawn only by the model, so taps on it reach the floor block under it.
// A floor custom component would make players sneak to place blocks, so empty-hand floor taps
// are caught here and not cancelled: vanilla does nothing on them (ADR 0094).
function tapFloor(
  ev: PlayerInteractWithBlockBeforeEvent,
  floor: TapDockFloor,
): void {
  const { block } = ev;
  if (!ev.isFirstEvent || ev.itemStack || block.typeId !== CAMPER_FLOOR_BLOCK)
    return;
  const tap = {
    dimensionId: asDimensionId(block.dimension.id),
    cell: block.location,
    player: ev.player.location,
  };
  system.run(() => floor.execute(tap));
}
