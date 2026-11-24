import {
  type Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import type { EndBuildSession } from "../../../application/build/endBuildSession";
import type { MenuChoices } from "../../../application/build/menuChoices";
import type { BuildStructureStore } from "../../../application/build/ports/structures";
import type { PressPasteAim } from "../../../application/build/pressPasteAim";
import type { PressUndo } from "../../../application/build/pressUndo";
import type { RotatePasteAim } from "../../../application/build/rotatePasteAim";
import type { ShowPreview } from "../../../application/build/showPreview";
import type { UndoEdit } from "../../../application/build/undoEdit";
import { AIR } from "../../../domain/build/blockState";
import { boxOf, sizeOf, volume } from "../../../domain/build/box";
import {
  facingVector,
  parseFacing,
} from "../../../domain/build/rotation/facing";
import { selectionOf } from "../../../domain/build/selection";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import { parseBlockFace } from "../../../domain/shared/blockFace";
import { cellOf } from "../../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../domain/shared/ids";
import {
  BUILD_NAMESPACE,
  TEST_EDIT_EVENT,
  TEST_RESULT_EVENT,
} from "../identifiers";
import type { DescribeBuild } from "./describeBuild";
import type { recordMessages } from "./recordMessages";
import type { TestAimReader } from "./testAim";

export function registerTestEdit(
  choices: MenuChoices,
  paste: PressPasteAim,
  undo: UndoEdit,
  pressUndo: PressUndo,
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
  const chooseFromMenu = new Map([
    ["shape", choices.chooseShape.bind(choices)],
    ["contents", choices.chooseContents.bind(choices)],
    ["stairContents", choices.chooseStairContents.bind(choices)],
    ["terrace", choices.chooseTerrace.bind(choices)],
    ["terrain", choices.chooseTerrain.bind(choices)],
    ["utility", choices.chooseUtility.bind(choices)],
    ["paste", choices.choosePaste.bind(choices)],
  ]);
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (
        ev.sourceType !== ScriptEventSource.Server ||
        ev.id !== TEST_EDIT_EVENT
      )
        return;
      const [id, command, ...args] = ev.message.trim().split(/\s+/);
      const [menu, entry] = args;
      const choose = command === "menu" && menu && chooseFromMenu.get(menu);
      const player = world.getAllPlayers().find((p) => p.id === id);
      if (!player?.isValid) return;
      const playerId = asPlayerId(player.id);
      let offered: boolean | undefined;
      if (command !== "state") messages.forget(playerId);
      try {
        // A fresh session makes the first-edit check independent of scenario order.
        if (
          command === "reset" &&
          (args.length === 0 || (args.length === 1 && args[0] === "absent"))
        ) {
          if (describe.editStatus(playerId).isEditing) return;
          previewAim?.aim.setFacing(playerId, undefined);
          previewAim?.aim.setHit(playerId, undefined);
          endSession.execute(playerId);
          if (args.length === 0) repo.getOrCreate(playerId);
        } else if (command === "aim" && args.length === 1 && previewAim) {
          const facing =
            args[0] === "clear" ? undefined : parseFacing(args[0] ?? "");
          if (args[0] !== "clear" && !facing) return;
          previewAim.aim.setFacing(playerId, facing);
          previewAim.aim.setHit(playerId, undefined);
          previewAim.preview.refresh(playerId, system.currentTick);
        } else if (
          command === "aim" &&
          args.length === 3 &&
          args.every((value) => Number.isSafeInteger(Number(value))) &&
          previewAim
        ) {
          previewAim.aim.setFacing(playerId, undefined);
          previewAim.aim.setHit(
            playerId,
            cellOf({
              x: Number(args[0]),
              y: Number(args[1]),
              z: Number(args[2]),
            }),
          );
          previewAim.preview.refresh(playerId, system.currentTick);
        } else if (
          command === "snapshot" &&
          args.length === 6 &&
          args.every((value) => Number.isInteger(Number(value)))
        ) {
          const box = boxOf(
            cellOf({
              x: Number(args[0]),
              y: Number(args[1]),
              z: Number(args[2]),
            }),
            cellOf({
              x: Number(args[3]),
              y: Number(args[4]),
              z: Number(args[5]),
            }),
          );
          const dimensionId = asDimensionId(player.dimension.id);
          const handle = structures.capture(
            dimensionId,
            box,
            playerId,
            "exact",
          );
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
          repo.update(repo.getOrCreate(playerId), (session) =>
            session.recordSnapshot({ dimensionId, box, handle }),
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
            cellOf({
              x: Number(args[0]),
              y: Number(args[1]),
              z: Number(args[2]),
            }),
            cellOf({
              x: Number(args[3]),
              y: Number(args[4]),
              z: Number(args[5]),
            }),
          );
          const dimensionId = asDimensionId(player.dimension.id);
          const handle = structures.capture(dimensionId, box, playerId, "copy");
          if (handle === "tooLarge" || handle === "unreadable")
            throw new Error(handle);
          const selection = selectionOf(dimensionId, box, AIR);
          repo.update(repo.getOrCreate(playerId), (session) => {
            session.completeCopy(selection, {
              material: selection.material,
              facing,
              size: sizeOf(box),
              blockCount: volume(box),
              contents: { kind: "structure", handle },
            });
          });
        } else if (command === "releaseStructures" && args.length === 0) {
          repo.update(repo.getOrCreate(playerId), (session) => {
            session.endPasting();
            if (!session.isEditing) session.clearHistory();
          });
        } else if (command === "state" && args.length === 0) {
          const mode = messages.lastMode(playerId);
          system.sendScriptEvent(
            TEST_RESULT_EVENT,
            JSON.stringify({
              player: player.name,
              ...describe.execute(playerId),
              clipboard: repo.get(playerId)?.clipboard,
              pasteReadyDegrees: mode?.degrees,
            }),
          );
          return;
        } else if (
          choose &&
          (args.length === 2 || (args.length === 1 && menu === "shape"))
        ) {
          offered = choose(playerId, entry, system.currentTick);
        } else if (
          command === "height" &&
          args.length === 1 &&
          Number.isInteger(Number(args[0]))
        ) {
          choices.submitHeight(playerId, Number(args[0]));
        } else if (
          command === "pasteat" &&
          (args.length === 4 ||
            ((args.length === 5 || args.length === 6 || args.length === 7) &&
              (args[4] === "true" || args[4] === "false"))) &&
          args.slice(0, 3).every((value) => Number.isInteger(Number(value)))
        ) {
          const face = parseBlockFace(args[3] ?? "");
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
              input: "pointer",
              ray: {
                origin: player.location,
                direction: facingVector(facing),
              },
              block: {
                cell: cellOf({
                  x: Number(args[0]),
                  y: Number(args[1]),
                  z: Number(args[2]),
                }),
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
        else if (command === "undoitem" && args.length === 0)
          pressUndo.execute({ playerId });
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
    const { flow, isEditing } = describe.editStatus(playerId);
    if (isEditing && system.currentTick - started < 200) {
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
        flow,
        timedOut: isEditing,
        message: last?.message,
        count: last?.count,
        skippedCount: last?.skippedCount,
        undoHints: messages.hints(playerId),
        pasteReadyDegrees: mode?.degrees,
        ticks: system.currentTick - started,
      }),
    );
  };
  if (delayTicks === 0) reply();
  else system.runTimeout(reply, delayTicks);
}
