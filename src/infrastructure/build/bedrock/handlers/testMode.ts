import { ScriptEventSource, system, world } from "@minecraft/server";
import type { UpdateBuildModes } from "../../../../application/build/updateBuildModes";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asPlayerId } from "../../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
} from "../../identifiers";

// A read of the real tick-driven mode; the message is the player's name (ADR 0010, 0178).
export function registerTestMode(
  modes: UpdateBuildModes,
  repo: BuildSessionRepository,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_MODE_EVENT
      )
        return;
      const player = world
        .getAllPlayers()
        .find((p) => p.name === ev.message.trim());
      if (!player?.isValid) return;
      system.sendScriptEvent(
        TEST_RESULT_EVENT,
        JSON.stringify({
          player: player.name,
          flow: repo.get(asPlayerId(player.id))?.flow ?? { kind: "idle" },
          mode: modes.isInBuildMode(asPlayerId(player.id)),
        }),
      );
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
