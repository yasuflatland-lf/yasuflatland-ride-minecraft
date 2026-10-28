import { world } from "@minecraft/server";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asPlayerId } from "../../../../domain/shared/ids";

export function registerSessions(repo: BuildSessionRepository): void {
  world.afterEvents.playerLeave.subscribe(({ playerId }) =>
    repo.remove(asPlayerId(playerId)),
  );
}
