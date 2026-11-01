import { world } from "@minecraft/server";
import type { EndPasting } from "../../../../application/build/endPasting";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import type { PressDebounces } from "../../../../domain/shared/pressDebounce";

export function registerSessions(
  repo: BuildSessionRepository,
  endPasting: EndPasting,
  debounce: PressDebounces<PlayerId>,
): void {
  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    const id = asPlayerId(playerId);
    repo.remove(id);
    debounce.remove(id);
  });
  world.afterEvents.playerDimensionChange.subscribe(({ player }) => {
    endPasting.execute(asPlayerId(player.id));
  });
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId === "minecraft:player")
      endPasting.execute(asPlayerId(deadEntity.id));
  });
}
