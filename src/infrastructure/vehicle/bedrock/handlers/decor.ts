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
import type { Vec3 } from "../../../../domain/shared/vec";
import {
  SeatPresses,
  seatSlotCell,
} from "../../../../domain/vehicle/kinds/index";
import { heldTypeId } from "../../../shared/heldItem";
import { pressedHeight, pressedShape } from "../faceHeight";
import {
  CAMPER_DECOR_COMPONENT,
  CAMPER_FURNITURE_BLOCK,
  campingGearOfItem,
  DECK_SEAT_TYPE,
  DECOR_HEIGHT_STATE,
  isCamperRoomBlock,
  isDecorBlock,
} from "../identifiers";

type DockCellOwner = (
  dimensionId: DimensionId,
  cell: Vec3,
) => VehicleId | undefined;

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
  // gear on a deck seat goes to the slot instead of seating the player (ADR 0097). A
  // taken seat refuses the gear, and the press stays cancelled, so the player does not
  // sit either (ADR 0104). The headlight switch on the same signal is not camping
  // gear, so the two never both act.
  const seatPresses = new SeatPresses<PlayerId>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const item = campingGearOfItem(ev.itemStack?.typeId);
    if (item !== undefined)
      placeGearOnSeat(ev, item, place, dockCellOwner, seatPresses);
  });
  // Removing goes through the decor block's custom component, like the room door (ADR 0068, 0093).
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(CAMPER_DECOR_COMPONENT, {
      onPlayerInteract: (ev) => {
        const player = ev.player;
        if (!player) return;
        if (heldTypeId(player) !== undefined) return;
        const vehicleId = dockCellOwner(
          asDimensionId(ev.dimension.id),
          ev.block.location,
        );
        if (vehicleId === undefined) return;
        // The table's pair block draws two items, and the press takes
        // back the end nearest the pressed x and z (ADR 0108). Both ends stand at one
        // height, so y does not choose; and the eye is left out because this event's
        // faceLocation.y is unmeasured, while the placing event's comes inverted (ADR 0111).
        const at = ev.block.location;
        const face = ev.faceLocation;
        remove.execute({
          playerId: asPlayerId(player.id),
          vehicleId,
          cell: at,
          point:
            face === undefined
              ? undefined
              : { x: at.x + face.x, y: at.y + face.y, z: at.z + face.z },
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
    isCamperRoomBlock(block.typeId) || isDecorBlock(block.typeId);
  if (!pressedRoom) return;
  const vehicleId = dockCellOwner(
    asDimensionId(block.dimension.id),
    block.location,
  );
  if (vehicleId === undefined) return;
  ev.cancel = true;
  if (!ev.isFirstEvent) return;
  // faceLocation is relative to the block's bottom north-west corner, and its y comes
  // inverted, so it is corrected before use (ADR 0111).
  const height = block.permutation.getAllStates()[DECOR_HEIGHT_STATE];
  const shape = pressedShape(
    block.typeId,
    typeof height === "number" ? height : undefined,
  );
  const point = {
    x: block.location.x + ev.faceLocation.x,
    y: block.location.y + pressedHeight(ev.blockFace, ev.faceLocation.y, shape),
    z: block.location.z + ev.faceLocation.z,
  };
  const cell = {
    x: block.location.x,
    y: block.location.y,
    z: block.location.z,
  };
  // A press on a furniture block's side face lands below the spot the player looked
  // at, so the slot is picked along the line of sight from the eye (ADR 0110).
  const head = ev.player.getHeadLocation();
  const eye = { x: head.x, y: head.y, z: head.z };
  const playerId = asPlayerId(ev.player.id);
  const hotbarSlot = ev.player.selectedSlotIndex;
  // Before events cannot change the world, so the item is taken on the next tick.
  system.run(() =>
    place.execute({
      playerId,
      vehicleId,
      item,
      point,
      cell,
      hotbarSlot,
      exact: false,
      eye,
    }),
  );
}

function placeGearOnSeat(
  ev: PlayerInteractWithEntityBeforeEvent,
  item: string,
  place: PlaceDecor,
  dockCellOwner: DockCellOwner,
  seatPresses: SeatPresses<PlayerId>,
): void {
  const seat = ev.target;
  if (seat.typeId !== DECK_SEAT_TYPE) return;
  const dimension = seat.dimension;
  const dimensionId = asDimensionId(dimension.id);
  const at = seat.location;
  const point = { x: at.x, y: at.y, z: at.z };
  const slot = seatSlotCell(point, (cell) =>
    isSlotBlock(dimension.getBlock(cell)?.typeId),
  );
  if (slot === undefined) return;
  const vehicleId = dockCellOwner(dimensionId, slot);
  if (vehicleId === undefined) return;
  ev.cancel = true;
  const playerId = asPlayerId(ev.player.id);
  if (!seatPresses.press(system.currentTick, playerId)) return;
  const hotbarSlot = ev.player.selectedSlotIndex;
  system.run(() =>
    place.execute({
      playerId,
      vehicleId,
      item,
      point,
      cell: slot,
      hotbarSlot,
      exact: true,
    }),
  );
}

/** An empty slot's furniture block or a placed gear's decor or pair block (ADR 0093, 0097, 0108). */
function isSlotBlock(typeId: string | undefined): boolean {
  if (typeId === undefined) return false;
  return typeId === CAMPER_FURNITURE_BLOCK || isDecorBlock(typeId);
}
