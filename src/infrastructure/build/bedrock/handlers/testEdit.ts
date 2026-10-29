import { ScriptEventSource, system, world } from "@minecraft/server";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../../application/build/ports/feedback";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_EDIT_EVENT,
  TEST_RESULT_EVENT,
} from "../../identifiers";
import { resolveBlockState } from "../blockStates";
import type { BuildToolActions } from "../editActions";

export interface LastMessage {
  message: BuildMessage;
  count?: number;
}

/**
 * Wraps `feedback` so the latest message per player can be read back. Edit
 * jobs report editDone and undoDone from later ticks through the shared
 * feedback, so the test hook has to observe that instance.
 */
export function recordMessages(feedback: BuildFeedback): {
  feedback: BuildFeedback;
  last(playerId: PlayerId): LastMessage | undefined;
  forget(playerId: PlayerId): void;
} {
  const latest = new Map<PlayerId, LastMessage>();
  return {
    feedback: {
      showMessage: (id, message, count) => {
        latest.set(id, { message, count });
        feedback.showMessage(id, message, count);
      },
      drawCorner: (id, dimension, cell) =>
        feedback.drawCorner(id, dimension, cell),
      drawOutline: (id, dimension, box, style) =>
        feedback.drawOutline(id, dimension, box, style),
    },
    last: (playerId) => latest.get(playerId),
    forget: (playerId) => {
      latest.delete(playerId);
    },
  };
}

export function registerTestEdit(
  actions: (id: PlayerId) => BuildToolActions,
  repo: BuildSessionRepository,
  messages: Pick<ReturnType<typeof recordMessages>, "last" | "forget">,
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
      const chosen = actions(playerId);
      messages.forget(playerId);
      try {
        if (command === "fill" && args.length === 1 && args[0])
          chosen.fill({ state: resolveBlockState(args[0]) });
        else if (
          command === "replace" &&
          args.length === 2 &&
          args[0] &&
          args[1]
        )
          chosen.replace(
            { typeId: resolveBlockState(args[0]).typeId },
            { state: resolveBlockState(args[1]) },
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
        const last = messages.last(playerId);
        system.sendScriptEvent(
          TEST_RESULT_EVENT,
          JSON.stringify({
            player: player.name,
            message: last?.message,
            count: last?.count,
            ticks: system.currentTick - started,
          }),
        );
      };
      reply();
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
