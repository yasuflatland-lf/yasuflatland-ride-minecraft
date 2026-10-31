import { world } from "@minecraft/server";
import type { CancelFlow } from "../../../../application/build/cancelFlow";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import type { PressDebounces } from "../../../../domain/shared/pressDebounce";

export function registerSessions(
  repo: BuildSessionRepository,
  cancel: CancelFlow,
  debounce: PressDebounces<PlayerId>,
): void {
  world.afterEvents.playerLeave.subscribe(({ playerId }) => {
    const id = asPlayerId(playerId);
    repo.remove(id);
    debounce.remove(id);
  });
  world.afterEvents.playerDimensionChange.subscribe(({ player }) => {
    cancel.execute({ playerId: asPlayerId(player.id) });
  });
  world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.typeId === "minecraft:player")
      cancel.execute({ playerId: asPlayerId(deadEntity.id) });
  });
}
