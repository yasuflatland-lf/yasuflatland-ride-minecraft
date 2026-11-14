import {
  type PlayerInteractWithBlockBeforeEvent,
  type PlayerInteractWithEntityBeforeEvent,
  system,
  world,
} from "@minecraft/server";
import type { PlaceDecor } from "../../../../../application/vehicle/placeDecor";
import type { PressStorage } from "../../../../../application/vehicle/pressStorage";
import type { RemoveDecor } from "../../../../../application/vehicle/removeDecor";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../../../domain/shared/ids";
import type { Vec3 } from "../../../../../domain/shared/vec";
import type { DecorItemId } from "../../../../../domain/vehicle/dock/decor";
import {
  DRAWER_GEAR_IDS,
  SeatPresses,
  seatSlotCell,
} from "../../../../../domain/vehicle/kinds/index";
import { heldTypeId } from "../../../../shared/heldItem";
import { id } from "../../../../shared/identifiers";
import { DECK_SEAT_TYPE } from "../../../bedrock/identifiers";
import { pressedHeight, pressedShape } from "../faceHeight";
import {
  CAMPER_DECOR_COMPONENT,
  CAMPER_FURNITURE_BLOCK,
  campingGearOfItem,
  DECOR_HEIGHT_STATE,
  isCamperRoomBlock,
  isDecorBlock,
  pairDecorBlockId,
} from "../identifiers";

type DockCellOwner = (
  dimensionId: DimensionId,
  cell: Vec3,
) => VehicleId | undefined;

export function registerDecor(
  place: PlaceDecor,
  remove: RemoveDecor,
  dockCellOwner: DockCellOwner,
  storage: PressStorage,
): void {
  const handled = new Map<PlayerId, number>();
  // Placing gear listens to the before event because most room blocks have no custom
  // component. A gear tap on a laid cell cancels every repeat of the long-press, so held
  // gear never runs the shower or sleeps in the bed; closed drawers open before placing (ADR 0093, 0098, 0121).
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    for (const [player, tick] of handled)
      if (system.currentTick - tick > 1) handled.delete(player);
    const item = campingGearOfItem(ev.itemStack?.typeId);
    if (
      ev.block.typeId === pairDecorBlockId("drawers") ||
      (ev.block.typeId === id("camper_floor") &&
        (item === undefined || DRAWER_GEAR_IDS.has(item)))
    ) {
      drawerPress(ev, item, place, remove, storage, dockCellOwner);
      if (ev.cancel) handled.set(asPlayerId(ev.player.id), system.currentTick);
      // A floor press that misses every drawer keeps the ordinary floor placement.
      if (ev.cancel || ev.block.typeId !== id("camper_floor")) return;
    }
    if (item !== undefined) placeGear(ev, item, place, dockCellOwner);
    if (ev.cancel) handled.set(asPlayerId(ev.player.id), system.currentTick);
  });
  world.afterEvents.itemUse.subscribe((ev) => {
    const item = campingGearOfItem(ev.itemStack.typeId);
    if (item === undefined || !DRAWER_GEAR_IDS.has(item)) return;
    const player = ev.source;
    const playerId = asPlayerId(player.id);
    const previous = handled.get(playerId);
    if (previous !== undefined && system.currentTick - previous <= 1) return;
    const feet = player.location;
    const cell = {
      x: Math.floor(feet.x),
      y: Math.floor(feet.y),
      z: Math.floor(feet.z),
    };
    const dimension = asDimensionId(player.dimension.id);
    const vehicleId =
      dockCellOwner(dimension, cell) ??
      dockCellOwner(dimension, { ...cell, y: cell.y - 1 });
    if (vehicleId === undefined) return;
    const eye = player.getHeadLocation();
    const direction = player.getViewDirection();
    // itemUse carries no tap point. Use the view ray, then only in the counter's
    // aisle allow the sole open free drawer: touch view and tap rays can differ.
    const target = storage.drawerTarget(
      vehicleId,
      eye,
      direction,
      undefined,
      item,
      feet,
    );
    if (!target) return;
    handled.set(playerId, system.currentTick);
    if (!target.open)
      storage.execute({
        playerId,
        vehicleId,
        cell: target.cell,
        point: {
          x: eye.x + direction.x,
          y: eye.y + direction.y,
          z: eye.z + direction.z,
        },
        eye,
        openOnly: true,
        takeContents: false,
      });
    else if (target.slot)
      place.execute({
        playerId,
        vehicleId,
        item,
        slot: target.slot,
        cell: target.cell,
        point: target.point,
        hotbarSlot: player.selectedSlotIndex,
        exact: true,
      });
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
  item: DecorItemId,
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
  item: DecorItemId,
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

function drawerPress(
  ev: PlayerInteractWithBlockBeforeEvent,
  item: DecorItemId | undefined,
  place: PlaceDecor,
  remove: RemoveDecor,
  storage: PressStorage,
  owner: DockCellOwner,
): void {
  if (item === undefined && ev.itemStack !== undefined) return;
  const vehicleId = owner(
    asDimensionId(ev.block.dimension.id),
    ev.block.location,
  );
  if (vehicleId === undefined) return;
  let cell = { ...ev.block.location };
  const point = {
    x: cell.x + ev.faceLocation.x,
    // Up and Down faces have known box heights. A side face reports the real
    // height on 1.26.63 touch (measured 4.679 and 10.467 px for the two drawers),
    // so the drawers cell picks its drawer from it; depth is not trusted.
    y:
      cell.y +
      (ev.blockFace === "Up" || ev.blockFace === "Down"
        ? pressedHeight(
            ev.blockFace,
            ev.faceLocation.y,
            pressedShape(ev.block.typeId, undefined),
          )
        : ev.faceLocation.y),
    z: cell.z + ev.faceLocation.z,
  };
  const playerId = asPlayerId(ev.player.id);
  const hotbarSlot = ev.player.selectedSlotIndex;
  const eye = ev.player.getHeadLocation();
  const drawersSideFace =
    ev.block.typeId === pairDecorBlockId("drawers") &&
    ev.blockFace !== "Up" &&
    ev.blockFace !== "Down";
  if (ev.block.typeId === id("camper_floor")) {
    if (item !== undefined && !DRAWER_GEAR_IDS.has(item)) return;
    const hit = storage.drawerTarget(
      vehicleId,
      eye,
      {
        x: point.x - eye.x,
        y: point.y - eye.y,
        z: point.z - eye.z,
      },
      cell,
    );
    if (!hit) return;
    cell = hit.cell;
  }
  ev.cancel = true;
  if (!ev.isFirstEvent) return;
  system.run(() => {
    if (item !== undefined) {
      if (
        !storage.execute({
          playerId,
          vehicleId,
          cell,
          point,
          eye,
          openOnly: true,
          takeContents: false,
          drawersSideFace,
        })
      )
        place.execute({
          playerId,
          vehicleId,
          cell,
          point,
          hotbarSlot,
          item,
          exact: false,
          eye,
        });
    } else if (
      !storage.execute({
        playerId,
        vehicleId,
        cell,
        point,
        eye,
        drawersSideFace,
      })
    ) {
      remove.execute({ playerId, vehicleId, cell, point, eye });
    }
  });
}
