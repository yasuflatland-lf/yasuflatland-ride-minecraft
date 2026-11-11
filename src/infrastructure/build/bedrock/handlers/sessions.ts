import { world } from "@minecraft/server";
import type { EndBuildSession } from "../../../../application/build/endBuildSession";
import type { EndPasting } from "../../../../application/build/endPasting";
import type { PressDebounces } from "../../../../domain/build/pressDebounce";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";

export function registerSessions(
  endSession: EndBuildSession,
  endPasting: EndPasting,
  debounce: PressDebounces<PlayerId>,
  pasteDebounce: PressDebounces<PlayerId>,
): void {
  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    const id = asPlayerId(playerId);
    endSession.execute(id);
    debounce.remove(id);
    pasteDebounce.remove(id);
  });
  world.afterEvents.playerDimensionChange.subscribe(({ player }) => {
    endPasting.execute(asPlayerId(player.id));
  });
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId === "minecraft:player")
      endPasting.execute(asPlayerId(deadEntity.id));
  });
}
