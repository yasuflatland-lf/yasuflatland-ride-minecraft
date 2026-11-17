import {
  type Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { ConfirmBoxStep } from "../../../../application/build/confirmBoxStep";
import type { DescribeBuild } from "../../../../application/build/describeBuild";
import { discardAll } from "../../../../application/build/discardAll";
import type { EndBuildSession } from "../../../../application/build/endBuildSession";
import type {
  BuildFeedback,
  BuildMessage,
  BuildMode,
} from "../../../../application/build/ports/feedback";
import type { BuildStructureStore } from "../../../../application/build/ports/structures";
import type { PressPasteAim } from "../../../../application/build/pressPasteAim";
import type { RotatePasteAim } from "../../../../application/build/rotatePasteAim";
import type { SetHeightTo } from "../../../../application/build/setHeightTo";
import type { ShowPreview } from "../../../../application/build/showPreview";
import type { UndoEdit } from "../../../../application/build/undoEdit";
import { parseFace } from "../../../../domain/build/aim/face";
import { boxOf, sizeOf, volume } from "../../../../domain/build/box";
import {
  facingVector,
  parseFacing,
} from "../../../../domain/build/rotation/facing";
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
import type { TestAimReader } from "./testAim";

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
  lastMode(playerId: PlayerId): BuildMode | undefined;
  hints(playerId: PlayerId): number;
  forget(playerId: PlayerId): void;
} {
  const latest = new Map<PlayerId, LastMessage>();
  const modes = new Map<PlayerId, BuildMode>();
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
      showMode: (id, mode) => {
        modes.set(id, mode);
        feedback.showMode(id, mode);
      },
      drawPreview: (id, dimension, set) =>
        feedback.drawPreview(id, dimension, set),
    },
    hints: (playerId) => hints.get(playerId) ?? 0,
    last: (playerId) => latest.get(playerId),
    lastMode: (playerId) => modes.get(playerId),
    forget: (playerId) => {
      latest.delete(playerId);
      modes.delete(playerId);
      hints.delete(playerId);
    },
  };
}

export function registerTestEdit(
  choices: MenuChoices,
  height: SetHeightTo,
  confirmBoxStep: ConfirmBoxStep,
  paste: PressPasteAim,
  undo: UndoEdit,
  describe: DescribeBuild,
  messages: Pick<
    ReturnType<typeof recordMessages>,
    "last" | "lastMode" | "hints" | "forget"
  >,
  repo: BuildSessionRepository,
  endSession: EndBuildSession,
  structures: BuildStructureStore,
  rotatePasteAim: RotatePasteAim,
  previewAim?: { aim: TestAimReader; preview: ShowPreview },
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
      if (command !== "state") messages.forget(playerId);
      try {
        // A fresh session makes the first-edit check independent of scenario order.
        if (command === "reset" && args.length === 0) {
          if (describe.editStatus(playerId).isEditing) return;
          previewAim?.aim.setFacing(playerId, undefined);
          endSession.execute(playerId);
          repo.getOrCreate(playerId);
        } else if (command === "aim" && args.length === 1 && previewAim) {
          const facing =
            args[0] === "clear" ? undefined : parseFacing(args[0] ?? "");
          if (args[0] !== "clear" && !facing) return;
          previewAim.aim.setFacing(playerId, facing);
          previewAim.preview.refresh(playerId, system.currentTick);
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
          discardAll(
            structures,
            repo
              .getOrCreate(playerId)
              .recordSnapshot({ dimensionId, box, handle }),
          );
        } else if (
          command === "structure" &&
          (args.length === 6 || args.length === 7) &&
          args.slice(0, 6).every((v) => Number.isInteger(Number(v)))
        ) {
          const facing = parseFacing(args[6] ?? "east");
          if (!facing) {
            system.sendScriptEvent(
              TEST_RESULT_EVENT,
              JSON.stringify({
                player: player.name,
                error: "Invalid structure facing",
              }),
            );
            return;
          }
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
              facing,
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
        } else if (command === "state" && args.length === 0) {
          const mode = messages.lastMode(playerId);
          system.sendScriptEvent(
            TEST_RESULT_EVENT,
            JSON.stringify({
              player: player.name,
              ...describe.execute(playerId),
              clipboard: repo.get(playerId)?.clipboard,
              pasteReadyDegrees:
                mode?.kind === "pasteReady" ? mode.degrees : undefined,
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
          (args.length === 4 ||
            ((args.length === 5 || args.length === 6 || args.length === 7) &&
              (args[4] === "true" || args[4] === "false"))) &&
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
          const facing = parseFacing(args[5] ?? "east");
          if (!facing) {
            system.sendScriptEvent(
              TEST_RESULT_EVENT,
              JSON.stringify({
                player: player.name,
                error: "Invalid paste facing",
              }),
            );
            return;
          }
          const rotations = Number(args[6] ?? 0);
          if (!Number.isInteger(rotations) || rotations < 0 || rotations > 3)
            return;
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
          for (let i = 0; i < rotations; i++)
            rotatePasteAim.execute({ playerId });
          paste.execute({
            playerId,
            dimensionId: asDimensionId(player.dimension.id),
            aim: {
              ray: {
                origin: player.location,
                direction: facingVector(facing),
              },
              block: {
                cell: {
                  x: Number(args[0]),
                  y: Number(args[1]),
                  z: Number(args[2]),
                },
                face,
              },
            },
            sneaking: args[4] !== "false",
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
      replyWhenSettled({
        player,
        playerId,
        describe,
        messages,
        offered,
        delayTicks: 0,
      });
    },
    { namespaces: [BUILD_NAMESPACE] },
  );
}

export function replyWhenSettled({
  player,
  playerId,
  describe,
  messages,
  offered,
  delayTicks,
}: {
  player: Player;
  playerId: PlayerId;
  describe: DescribeBuild;
  messages: Pick<
    ReturnType<typeof recordMessages>,
    "last" | "lastMode" | "hints"
  >;
  offered?: boolean;
  delayTicks: number;
}): void {
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
    const mode = messages.lastMode(playerId);
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
        pasteReadyDegrees:
          mode?.kind === "pasteReady" ? mode.degrees : undefined,
        ticks: system.currentTick - started,
      }),
    );
  };
  if (delayTicks === 0) reply();
  else system.runTimeout(reply, delayTicks);
}
