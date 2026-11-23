import {
  type PlayerInteractWithBlockBeforeEvent,
  system,
  world,
} from "@minecraft/server";
import type { PressRoom } from "../../../../../application/vehicle/room/pressRoom";
import type { Debounces } from "../../../../../domain/shared/debounce";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../../domain/shared/ids";
import { add3 } from "../../../../../domain/shared/vec";
import type { DockLayer } from "../../../bedrock/dockLayer";
import { pressedHeight, pressedShape } from "../faceHeight";
import {
  CAMPER_FLOOR_BLOCK,
  campingGearOfItem,
  DECOR_HEIGHT_STATE,
  isCamperRoomBlock,
  isDecorBlock,
  pairDecorBlockId,
} from "../identifiers";
import { touchCorrectedFaceLocation } from "../touchFaceLocation";

function prepareBlock(
  ev: PlayerInteractWithBlockBeforeEvent,
  room: PressRoom,
  owner: DockLayer["cellOwner"],
) {
  const { block, player, blockFace, faceLocation } = ev;
  const item = campingGearOfItem(ev.itemStack?.typeId);
  if (!item && ev.itemStack) return;
  const drawers = block.typeId === pairDecorBlockId("drawers");
  const floor = block.typeId === CAMPER_FLOOR_BLOCK;
  if (!item && !floor && !drawers) return;
  if (!isCamperRoomBlock(block.typeId) && !isDecorBlock(block.typeId)) return;
  const cell = block.location;
  const vehicleId = owner(asDimensionId(block.dimension.id), cell);
  if (vehicleId === undefined) return;
  const press = {
    source: "block" as const,
    playerId: asPlayerId(player.id),
    vehicleId,
    cell,
    eye: player.getHeadLocation(),
    held: item ? { item, hotbarSlot: player.selectedSlotIndex } : undefined,
  };
  const height = block.permutation.getAllStates()[DECOR_HEIGHT_STATE];
  const shape = pressedShape(
    block.typeId,
    typeof height === "number" ? height : undefined,
  );
  const point = add3(cell, {
    ...faceLocation,
    y: pressedHeight(blockFace, faceLocation.y, shape),
  });
  if (!drawers && !floor)
    return room.prepare({ ...press, point, surface: { kind: "room" } });

  // Touch reports mirror x and y for drawers. A missed floor ray still uses the ordinary decor point (ADR 0111).
  const face = touchCorrectedFaceLocation(
    faceLocation,
    player.inputInfo.lastInputModeUsed,
  );
  const sideFace = blockFace !== "Up" && blockFace !== "Down";
  const drawerPoint = add3(cell, {
    ...face,
    y: sideFace ? face.y : pressedHeight(blockFace, face.y, shape),
  });
  if (drawers)
    return room.prepare({
      ...press,
      point: drawerPoint,
      surface: { kind: "drawers", sideFace },
    });
  return room.prepare({
    ...press,
    point,
    surface: { kind: "floor", drawerPoint, allowPlacementOnMiss: !ev.cancel },
  });
}

export function registerBlockPress(
  room: PressRoom,
  owner: DockLayer["cellOwner"],
  handled: Debounces<PlayerId>,
): void {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    handled.forgetIdle(system.currentTick);
    const action = prepareBlock(ev, room, owner);
    if (action) {
      ev.cancel = true;
      if (ev.isFirstEvent) system.run(action);
    }
    if (ev.cancel) handled.record(asPlayerId(ev.player.id), system.currentTick);
  });
}
