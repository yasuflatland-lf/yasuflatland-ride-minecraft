import {
  type PlayerInteractWithBlockBeforeEvent,
  type PlayerInteractWithEntityBeforeEvent,
  system,
  world,
} from "@minecraft/server";
import type { PlaceDecor } from "../../../../application/vehicle/placeDecor";
import type { RemoveDecor } from "../../../../application/vehicle/removeDecor";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import type { Vec3 } from "../../../../domain/shared/vec";
import {
  CAMPER_DECOR_COMPONENT,
  CAMPER_FURNITURE_BLOCK,
  campingGearOfDecorBlock,
  campingGearOfItem,
  DECK_SEAT_TYPE,
  isCamperRoomBlock,
} from "../identifiers";

type DockCellOwner = (
  dimensionId: DimensionId,
  cell: Vec3,
) => VehicleId | undefined;

// A dinette deck seat stands on the floor layer, under its slot cell; the cells from the
// seat's own up to the ceiling layer are searched for the slot (ADR 0068, 0097).
const SEAT_SLOT_SEARCH_LAYERS = 3;

export function registerDecor(
  place: PlaceDecor,
  remove: RemoveDecor,
  dockCellOwner: DockCellOwner,
): void {
  // Placing gear listens to the before event because most room blocks have no custom
  // component. A gear tap on a laid cell cancels every repeat of the long-press, so held
  // gear never opens a door, runs the shower, or sleeps in the bed (ADR 0093, 0098).
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const item = campingGearOfItem(ev.itemStack?.typeId);
    if (item !== undefined) placeGear(ev, item, place, dockCellOwner);
  });
  // A deck seat stands on each dinette seat's slot and takes the press first, so held
  // gear on a deck seat goes to the slot instead of seating the player (ADR 0097). The
  // headlight switch on the same signal is not camping gear, so the two never both act.
  const pressedThisTick = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const item = campingGearOfItem(ev.itemStack?.typeId);
    if (item !== undefined)
      placeGearOnSeat(ev, item, place, dockCellOwner, pressedThisTick);
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
        if (vehicleId === undefined) return;
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
  dockCellOwner: DockCellOwner,
): void {
  const { block } = ev;
  const pressedRoom =
    isCamperRoomBlock(block.typeId) ||
    campingGearOfDecorBlock(block.typeId) !== undefined;
  if (!pressedRoom) return;
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
  const cell = {
    x: block.location.x,
    y: block.location.y,
    z: block.location.z,
  };
  const playerId = asPlayerId(ev.player.id);
  const hotbarSlot = ev.player.selectedSlotIndex;
  // Before events cannot change the world, so the item is taken on the next tick.
  system.run(() =>
    place.execute({ playerId, vehicleId, item, point, cell, hotbarSlot }),
  );
}

function placeGearOnSeat(
  ev: PlayerInteractWithEntityBeforeEvent,
  item: string,
  place: PlaceDecor,
  dockCellOwner: DockCellOwner,
  pressedThisTick: TickScopedSet<PlayerId>,
): void {
  const seat = ev.target;
  if (seat.typeId !== DECK_SEAT_TYPE) return;
  const dimension = seat.dimension;
  const dimensionId = asDimensionId(dimension.id);
  const at = seat.location;
  const point = { x: at.x, y: at.y, z: at.z };
  const slot = seatSlotCell(point, (cell) => {
    const typeId = dimension.getBlock(cell)?.typeId;
    return (
      typeId !== undefined &&
      (typeId === CAMPER_FURNITURE_BLOCK ||
        campingGearOfDecorBlock(typeId) !== undefined)
    );
  });
  if (slot === undefined) return;
  const vehicleId = dockCellOwner(dimensionId, slot);
  if (vehicleId === undefined) return;
  ev.cancel = true;
  const playerId = asPlayerId(ev.player.id);
  // The entity event has no isFirstEvent, so the repeats of one press are dropped per tick.
  if (!pressedThisTick.add(system.currentTick, playerId)) return;
  const hotbarSlot = ev.player.selectedSlotIndex;
  system.run(() =>
    place.execute({ playerId, vehicleId, item, point, cell: slot, hotbarSlot }),
  );
}

/** The lowest cell from the seat's own up that holds a decor slot's block, if any (ADR 0097). */
function seatSlotCell(
  seat: Vec3,
  holdsSlot: (cell: Vec3) => boolean,
): Vec3 | undefined {
  const x = Math.floor(seat.x);
  const z = Math.floor(seat.z);
  const bottom = Math.floor(seat.y);
  for (let y = bottom; y < bottom + SEAT_SLOT_SEARCH_LAYERS; y++) {
    const cell = { x, y, z };
    if (holdsSlot(cell)) return cell;
  }
  return undefined;
}
