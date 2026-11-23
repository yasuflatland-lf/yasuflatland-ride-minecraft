import { world } from "@minecraft/server";
import type { EndBuildSession } from "../../../../application/build/endBuildSession";
import type { EndPasting } from "../../../../application/build/endPasting";
import type { Debounces } from "../../../../domain/shared/debounce";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";

export function registerSessions(
  endSession: EndBuildSession,
  endPasting: EndPasting,
  debounce: Debounces<PlayerId>,
  pasteDebounce: Debounces<PlayerId>,
  rotateDebounce: Debounces<PlayerId>,
  undoDebounce: Debounces<PlayerId>,
  onPlayerLeave: (id: PlayerId) => void,
): void {
  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    const id = asPlayerId(playerId);
    endSession.execute(id);
    onPlayerLeave(id);
    debounce.forget(id);
    pasteDebounce.forget(id);
    rotateDebounce.forget(id);
    undoDebounce.forget(id);
  });
  world.afterEvents.playerDimensionChange.subscribe(({ player }) => {
    endPasting.execute(asPlayerId(player.id));
  });
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId === "minecraft:player")
      endPasting.execute(asPlayerId(deadEntity.id));
  });
}
