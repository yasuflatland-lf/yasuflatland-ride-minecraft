import { ScriptEventSource, system, world } from "@minecraft/server";
import { asPlayerId } from "../../../domain/shared/ids";
import type { PasteControlRoutes } from "../bedrock/handlers/pasteControls";
import { BUILD_NAMESPACE, TEST_PRESS_EVENT } from "../identifiers";
import type { DescribeBuild } from "./describeBuild";
import type { recordMessages } from "./recordMessages";
import { replyWhenSettled } from "./testEdit";

export function registerTestPress(
  routes: PasteControlRoutes,
  describe: DescribeBuild,
  messages: Pick<
    ReturnType<typeof recordMessages>,
    "last" | "lastMode" | "hints" | "forget"
  >,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_PRESS_EVENT
      )
        return;
      const [id, sequence, gapText = "0", ...extra] = ev.message
        .trim()
        .split(/\s+/);
      if (!sequence || extra.length > 0 || !/^\d+$/.test(gapText)) return;
      const gap = Number(gapText);
      if (!Number.isSafeInteger(gap) || gap > 40) return;
      const presses = sequence.split(",");
      if (
        !presses.every(
          (route) => route === "itemUse" || route === "blockInteract",
        )
      )
        return;
      const player = world.getAllPlayers().find((p) => p.id === id);
      if (!player?.isValid) return;
      const playerId = asPlayerId(player.id);
      messages.forget(playerId);
      presses.forEach((route, i) => {
        const press = () => {
          if (!player.isValid) return;
          routes[route](player);
          // Block taps defer their held-item re-check to system.run.
          if (i === presses.length - 1)
            replyWhenSettled({
              player,
              playerId,
              describe,
              messages,
              delayTicks: 2,
            });
        };
        if (i * gap === 0) press();
        else system.runTimeout(press, i * gap);
      });
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
