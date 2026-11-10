import { Direction, system, world } from "@minecraft/server";
import type { PlaceFurniture } from "../../../../application/resort/placeFurniture";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { furnitureKindOf } from "../../identifiers";

export function registerFurniturePlacement(place: PlaceFurniture): void {
  const requested = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const kind = furnitureKindOf(ev.itemStack?.typeId ?? "", "item");
    if (!ev.isFirstEvent || kind === undefined) return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, player)) return;
    const cmd = {
      kind,
      player,
      dimension: asDimensionId(ev.block.dimension.id),
      block: { ...ev.block.location },
      face: ev.blockFace === Direction.Up ? "up" : "other",
      yaw: ev.player.getRotation().y,
      slot: ev.player.selectedSlotIndex,
    };
    system.run(() => place.execute(cmd));
  });
}
