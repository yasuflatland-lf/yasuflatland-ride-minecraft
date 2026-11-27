import { ScriptEventSource, system, world } from "@minecraft/server";
import type { PressWand } from "../../../application/build/pressWand";
import { blockTapOf } from "../../../domain/build/blockTap";
import { routePress } from "../../../domain/build/flow/press";
import { parseBlockFace } from "../../../domain/shared/blockFace";
import { cellOf } from "../../../domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../domain/shared/ids";
import type { PasteControlRoutes } from "../bedrock/handlers/pasteControls";
import { BUILD_NAMESPACE, TEST_PRESS_EVENT } from "../identifiers";
import type { DescribeBuild } from "./describeBuild";
import type { recordMessages } from "./recordMessages";
import { replyWhenSettled } from "./testEdit";

export function registerTestPress(
  routes: PasteControlRoutes,
  pressWand: Pick<PressWand, "execute">,
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
      const [id, sequence, ...args] = ev.message.trim().split(/\s+/);
      if (!sequence) return;
      const player = world.getAllPlayers().find((p) => p.id === id);
      if (!player?.isValid) return;
      const playerId = asPlayerId(player.id);
      if (sequence === "tap") {
        const [xText, yText, zText, faceText, quietText] = args;
        if (
          args.length !== 5 ||
          !xText ||
          !yText ||
          !zText ||
          !faceText ||
          !quietText ||
          !/^\d+$/.test(quietText)
        )
          return;
        const x = Number(xText);
        const y = Number(yText);
        const z = Number(zText);
        const quietTicks = Number(quietText);
        const face = parseBlockFace(faceText);
        if (!face || ![x, y, z, quietTicks].every(Number.isSafeInteger)) return;
        const { flow } = describe.editStatus(playerId);
        const intent = routePress({
          flow,
          role: "wand",
          route: "blockInteract",
          target: "block",
          sneaking: player.isSneaking,
        }).kind;
        messages.forget(playerId);
        pressWand.execute({
          playerId,
          intent,
          tap: blockTapOf(
            asDimensionId(player.dimension.id),
            cellOf({ x, y, z }),
            face,
          ),
          quietTicks,
          tick: system.currentTick,
        });
        // Scripted menu choices use the resulting flow without opening UI.
        replyWhenSettled({
          player,
          playerId,
          describe,
          messages,
          delayTicks: 0,
        });
        return;
      }
      const [gapText = "0", ...extra] = args;
      if (extra.length > 0 || !/^\d+$/.test(gapText)) return;
      const gap = Number(gapText);
      if (!Number.isSafeInteger(gap) || gap > 40) return;
      const presses = sequence.split(",");
      if (
        !presses.every(
          (route) => route === "itemUse" || route === "blockInteract",
        )
      )
        return;
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
