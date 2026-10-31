import { ScriptEventSource, system, world } from "@minecraft/server";
import type { PasteAt } from "../../../../application/build/pasteAt";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../../application/build/ports/feedback";
import type { SetRoofHeightTo } from "../../../../application/build/setRoofHeightTo";
import type { UndoEdit } from "../../../../application/build/undoEdit";
import type { Face } from "../../../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../../../domain/build/sessionRepository";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_EDIT_EVENT,
  TEST_RESULT_EVENT,
} from "../../identifiers";
import type { MenuChoices } from "../menuChoices";

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
      drawPreview: (id, dimension, set) =>
        feedback.drawPreview(id, dimension, set),
    },
    last: (playerId) => latest.get(playerId),
    forget: (playerId) => {
      latest.delete(playerId);
    },
  };
}

export function registerTestEdit(
  choices: MenuChoices,
  height: SetRoofHeightTo,
  paste: PasteAt,
  undo: UndoEdit,
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
      let offered: boolean | undefined;
      messages.forget(playerId);
      try {
        if (
          command === "menu" &&
          (args[0] === "shape" ||
            args[0] === "roof" ||
            args[0] === "utility") &&
          (args.length === 2 ||
            (args.length === 3 && (args[2] === "0" || args[2] === "1")))
        ) {
          offered = choices.choose(playerId, args[0], args[1], {
            skipAir: args[2] === "1",
          });
        } else if (
          command === "height" &&
          args.length === 1 &&
          Number.isInteger(Number(args[0]))
        ) {
          height.execute({ playerId, height: Number(args[0]) });
        } else if (
          command === "pasteat" &&
          args.length === 4 &&
          args.slice(0, 3).every((value) => Number.isInteger(Number(value))) &&
          ["up", "down", "north", "south", "east", "west"].includes(
            args[3] ?? "",
          )
        ) {
          paste.execute({
            playerId,
            dimensionId: asDimensionId(player.dimension.id),
            block: {
              x: Number(args[0]),
              y: Number(args[1]),
              z: Number(args[2]),
            },
            face: args[3] as Face,
          });
        } else if (command === "undo" && args.length === 0)
          undo.execute({ playerId });
        else return;
      } catch {
        // A malformed test command must not interrupt the server event loop.
        return;
      }
      const started = system.currentTick;
      const reply = () => {
        if (!player.isValid) return;
        if (
          repo.get(playerId)?.isEditing &&
          system.currentTick - started < 200
        ) {
          system.runTimeout(reply, 1);
          return;
        }
        const last = messages.last(playerId);
        system.sendScriptEvent(
          TEST_RESULT_EVENT,
          JSON.stringify({
            player: player.name,
            offered,
            flow: repo.get(playerId)?.flow ?? { kind: "idle" },
            timedOut: repo.get(playerId)?.isEditing ?? false,
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
