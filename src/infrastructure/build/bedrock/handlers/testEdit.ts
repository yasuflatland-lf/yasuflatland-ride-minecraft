import {
  BlockPermutation,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../../application/build/ports/feedback";
import { blockStateOf } from "../../../../domain/build/blockState";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_EDIT_EVENT,
  TEST_RESULT_EVENT,
} from "../../identifiers";
import type { BuildToolActions } from "../editActions";

export function registerTestEdit(
  actions: (id: PlayerId, feedback: BuildFeedback) => BuildToolActions,
  repo: BuildSessionRepository,
  feedback: BuildFeedback,
): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_EDIT_EVENT
      )
        return;
      const [id, command, ...args] = ev.message.trim().split(/\s+/);
      const player = world.getAllPlayers().find((p) => p.id === id);
      if (!player?.isValid) return;
      const playerId = asPlayerId(player.id);
      let message: BuildMessage | undefined;
      let count: number | undefined;
      const chosen = actions(playerId, {
        showMessage: (id, name, value) => {
          message = name;
          count = value;
          feedback.showMessage(id, name, value);
        },
        drawOutline: (id, dimension, box, style) =>
          feedback.drawOutline(id, dimension, box, style),
      });
      const resolve = (type: string) => {
        const permutation = BlockPermutation.resolve(type);
        return blockStateOf(permutation.type.id, permutation.getAllStates());
      };
      try {
        if (command === "fill" && args.length === 1 && args[0])
          chosen.fill({ state: resolve(args[0]) });
        else if (
          command === "replace" &&
          args.length === 2 &&
          args[0] &&
          args[1]
        )
          chosen.replace(
            { typeId: resolve(args[0]).typeId },
            { state: resolve(args[1]) },
          );
        else if (command === "copy" && args.length === 0) chosen.copy();
        else if (
          command === "paste" &&
          args.length === 1 &&
          (args[0] === "0" || args[0] === "1")
        )
          chosen.paste(args[0] === "1");
        else if (command === "undo" && args.length === 0) chosen.undo();
        else return;
      } catch {
        // A malformed test command must not interrupt the server event loop.
        return;
      }
      const started = system.currentTick;
      const reply = () => {
        if (!player.isValid) return;
        if (repo.get(playerId)?.isEditing) {
          system.runTimeout(reply, 1);
          return;
        }
        system.sendScriptEvent(
          TEST_RESULT_EVENT,
          JSON.stringify({
            player: player.name,
            message,
            count,
            ticks: system.currentTick - started,
          }),
        );
      };
      reply();
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
