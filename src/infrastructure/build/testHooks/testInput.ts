import { ScriptEventSource, system, world } from "@minecraft/server";
import { asPlayerId } from "../../../domain/shared/ids";
import { BUILD_NAMESPACE, TEST_INPUT_EVENT } from "../identifiers";
import type { TestAimReader } from "./testAim";

export function registerTestInput(aim: TestAimReader): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (event) => {
      if (
        event.sourceType !== ScriptEventSource.Server ||
        event.id !== TEST_INPUT_EVENT
      )
        return;
      let input: { player?: string; touch?: boolean } | null;
      try {
        input = JSON.parse(event.message);
      } catch {
        return;
      }
      if (typeof input?.player !== "string" || typeof input.touch !== "boolean")
        return;
      const player = world
        .getAllPlayers()
        .find(({ name }) => name === input.player);
      if (player?.isValid) aim.setTouch(asPlayerId(player.id), input.touch);
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
