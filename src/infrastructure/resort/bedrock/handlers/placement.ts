import { Direction, system, world } from "@minecraft/server";
import type { PlaceParasol } from "../../../../application/resort/placeParasol";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { BEACH_PARASOL_ITEM } from "../../identifiers";

export function registerParasolPlacement(place: PlaceParasol): void {
  const requested = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.isFirstEvent || ev.itemStack?.typeId !== BEACH_PARASOL_ITEM) return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, player)) return;
    const cmd = {
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
