import {
  type Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import { asPlayerId } from "../../../domain/shared/ids";
import type { BedrockTapTargets } from "../bedrock/bedrockTapTargets";
import { BUILD_NAMESPACE, TEST_TAP_TARGET_EVENT } from "../identifiers";

// Script cannot emit entity hit events, so the scenario calls the press handler directly.
export function registerTestTapTarget(
  targets: BedrockTapTargets,
  press: (player: Player, targetId: string) => void,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_TAP_TARGET_EVENT
      )
        return;
      const player = world
        .getAllPlayers()
        .find((p) => p.name === ev.message.trim());
      if (!player?.isValid) return;
      const targetId = targets.targetIdOf(asPlayerId(player.id));
      if (targetId) press(player, targetId);
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
