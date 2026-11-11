import { ScriptEventSource, system, world } from "@minecraft/server";
import type { ConfirmBoxStep } from "../../../../application/build/confirmBoxStep";
import type { DescribeBuild } from "../../../../application/build/describeBuild";
import type { EndBuildSession } from "../../../../application/build/endBuildSession";
import type { PasteAt } from "../../../../application/build/pasteAt";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../../../application/build/ports/feedback";
import type { BuildStructureStore } from "../../../../application/build/ports/structures";
import type { RotatePasteAim } from "../../../../application/build/rotatePasteAim";
import type { SetHeightTo } from "../../../../application/build/setHeightTo";
import type { UndoEdit } from "../../../../application/build/undoEdit";
import { boxOf, sizeOf, volume } from "../../../../domain/build/box";
import {
  parseFace,
  pasteTarget,
} from "../../../../domain/build/clipboard/clipboard";
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

interface LastMessage {
  message: BuildMessage;
  count?: number;
  skippedCount?: number;
}

/**
 * Wraps `feedback` so the latest message per player can be read back. Edit
 * jobs report editDone and undoDone from later ticks through the shared
 * feedback, so the test hook has to observe that instance.
 */
export function recordMessages(feedback: BuildFeedback): {
  feedback: BuildFeedback;
  last(playerId: PlayerId): LastMessage | undefined;
  hints(playerId: PlayerId): number;
  forget(playerId: PlayerId): void;
} {
  const latest = new Map<PlayerId, LastMessage>();
  const hints = new Map<PlayerId, number>();
  return {
    feedback: {
      showMessage: (id, message, count, material, skippedCount) => {
        latest.set(id, { message, count, skippedCount });
        feedback.showMessage(id, message, count, material, skippedCount);
      },
      showUndoHint: (id) => {
        hints.set(id, (hints.get(id) ?? 0) + 1);
        feedback.showUndoHint(id);
      },
      showSize: (id, size) => feedback.showSize(id, size),
      showPasteHint: (id, size, count) =>
        feedback.showPasteHint(id, size, count),
      drawPreview: (id, dimension, set) =>
        feedback.drawPreview(id, dimension, set),
    },
    hints: (playerId) => hints.get(playerId) ?? 0,
    last: (playerId) => latest.get(playerId),
    forget: (playerId) => {
      latest.delete(playerId);
      hints.delete(playerId);
    },
  };
}

export function registerTestEdit(
  choices: MenuChoices,
  height: SetHeightTo,
  confirmBoxStep: ConfirmBoxStep,
  paste: PasteAt,
  undo: UndoEdit,
  describe: DescribeBuild,
  messages: Pick<
    ReturnType<typeof recordMessages>,
    "last" | "hints" | "forget"
  >,
  repo: BuildSessionRepository,
  endSession: EndBuildSession,
  structures: BuildStructureStore,
  rotate: RotatePasteAim,
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
        // A fresh session makes the first-edit check independent of scenario order.
        if (command === "reset" && args.length === 0) {
          if (describe.editStatus(playerId).isEditing) return;
          endSession.execute(playerId);
          repo.getOrCreate(playerId);
        } else if (
          command === "snapshot" &&
          args.length === 6 &&
          args.every((value) => Number.isInteger(Number(value)))
        ) {
          const box = boxOf(
            { x: Number(args[0]), y: Number(args[1]), z: Number(args[2]) },
            { x: Number(args[3]), y: Number(args[4]), z: Number(args[5]) },
          );
          const dimensionId = asDimensionId(player.dimension.id);
          const handle = structures.capture(dimensionId, box, playerId);
          if (handle === "tooLarge" || handle === "unreadable") {
            system.sendScriptEvent(
              TEST_RESULT_EVENT,
              JSON.stringify({
                player: player.name,
                error: `Snapshot capture refused: ${handle}`,
              }),
            );
            return;
          }
          for (const dropped of repo
            .getOrCreate(playerId)
            .recordSnapshot({ dimensionId, box, handle }))
            structures.discard(dropped);
        } else if (
          command === "structure" &&
          args.length === 6 &&
          args.every((v) => Number.isInteger(Number(v)))
        ) {
          const box = boxOf(
            { x: Number(args[0]), y: Number(args[1]), z: Number(args[2]) },
            { x: Number(args[3]), y: Number(args[4]), z: Number(args[5]) },
          );
          const dimensionId = asDimensionId(player.dimension.id);
          const handle = structures.capture(dimensionId, box, playerId);
          if (handle === "tooLarge" || handle === "unreadable")
            throw new Error(handle);
          const previous = repo
            .getOrCreate(playerId)
            .completeCopy(dimensionId, box, {
              size: sizeOf(box),
              blockCount: volume(box),
              contents: { kind: "structure", handle },
            });
          if (previous) structures.discard(previous);
        } else if (command === "releaseStructures" && args.length === 0) {
          const session = repo.getOrCreate(playerId);
          const clipboard = session.clipboard;
          if (clipboard?.contents.kind === "structure")
            structures.discard(clipboard.contents.handle);
          while (session.hasHistory && !session.isEditing) {
            const entry = session.takeUndo();
            if (typeof entry !== "string" && entry.kind === "snapshot")
              structures.discard(entry.snapshot.handle);
          }
          session.endPasting();
        } else if (command === "rotate" && args.length === 0) {
          rotate.execute({ playerId });
        } else if (command === "state" && args.length === 0) {
          system.sendScriptEvent(
            TEST_RESULT_EVENT,
            JSON.stringify({
              player: player.name,
              ...describe.execute(playerId),
              clipboard: repo.get(playerId)?.clipboard,
            }),
          );
          return;
        } else if (
          command === "menu" &&
          (args[0] === "shape" ||
            args[0] === "contents" ||
            args[0] === "terrain" ||
            args[0] === "utility" ||
            args[0] === "paste") &&
          args.length === 2
        ) {
          offered = choices.choose(playerId, args[0], args[1]);
        } else if (
          command === "height" &&
          args.length === 1 &&
          Number.isInteger(Number(args[0]))
        ) {
          height.execute({ playerId, height: Number(args[0]) });
        } else if (command === "confirmbox" && args.length === 0) {
          confirmBoxStep.execute({ playerId });
        } else if (
          command === "pasteat" &&
          args.length === 4 &&
          args.slice(0, 3).every((value) => Number.isInteger(Number(value)))
        ) {
          const face = parseFace(args[3] ?? "");
          if (!face) {
            system.sendScriptEvent(
              TEST_RESULT_EVENT,
              JSON.stringify({
                player: player.name,
                error: "Invalid paste face",
              }),
            );
            return;
          }
          const clipboard = repo.get(playerId)?.clipboard;
          if (!clipboard) {
            system.sendScriptEvent(
              TEST_RESULT_EVENT,
              JSON.stringify({
                player: player.name,
                error: "No clipboard for paste",
              }),
            );
            return;
          }
          paste.execute({
            playerId,
            dimensionId: asDimensionId(player.dimension.id),
            target: pasteTarget(
              clipboard,
              {
                x: Number(args[0]),
                y: Number(args[1]),
                z: Number(args[2]),
              },
              face,
              describe.execute(playerId).pasteTurn,
            ),
            tick: system.currentTick,
          });
        } else if (
          command === "slot" &&
          args.length === 1 &&
          Number.isInteger(Number(args[0])) &&
          Number(args[0]) >= 0 &&
          Number(args[0]) < 9
        ) {
          player.selectedSlotIndex = Number(args[0]);
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
          describe.editStatus(playerId).isEditing &&
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
            flow: describe.editStatus(playerId).flow,
            timedOut: describe.editStatus(playerId).isEditing,
            message: last?.message,
            count: last?.count,
            skippedCount: last?.skippedCount,
            undoHints: messages.hints(playerId),
            ticks: system.currentTick - started,
          }),
        );
      };
      reply();
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}
