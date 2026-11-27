import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { blockTapOf } from "../../../src/domain/build/blockTap";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import { turnBetween } from "../../../src/domain/build/rotation/facing";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { BlockFace } from "../../../src/domain/shared/blockFace";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { NETHER_RANGE } from "../../helpers/buildHeightRange";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  chooseHeightedFlow,
  confirmEndpointHeight,
  selectionFlows,
  tapAir,
  tapBlock,
} from "../../support/buildSelection";
import { undoRecord } from "../../support/undoRecord";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeWorld,
  nether,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const face = fc.constantFrom<BlockFace>(
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
);
const tick = fc.integer({ min: 0, max: 10000 });

function setup(
  block: { x: number; y: number; z: number },
  face: BlockFace,
  tick: number,
) {
  const world = new FakeWorld();
  const structures = new FakeStructureStore(world);
  const repo = new FakeSessions(structures);
  const session = repo.getOrCreate(playerId);
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    new FakeBuildPlayers(),
  );
  const paste = new PasteAt(
    repo,
    world,
    feedback,
    structures,
    new FakeBuildPlayers(),
  );
  const ground = new FakeGroundProbe();
  const press = new PressPasteAim(
    repo,
    paste,
    feedback,
    new ResolvePasteTarget(repo, ground),
    { facingOf: () => "east" },
  );
  const clipboard = structureClipboard(
    boxOf(cellOf(block), cellOf({ ...block, x: block.x + 1 })),
    () => stone,
    structures,
  );
  holdClipboard(session, clipboard);
  session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
  const tap = blockTapOf(nether, cellOf(block), face);
  const setTarget = () => press.tap({ playerId, tap, tick, quietTicks: 0 });
  setTarget();
  const clearTarget = () => session.pasted();
  const target = pasteTarget(
    clipboard,
    tap.cell,
    face,
    turnBetween(clipboard.facing, "east"),
  );
  const start = vi.spyOn(structures, "place");
  const execute = (
    sneaking = true,
    intent?: "wand" | "place",
    quietTicks = Infinity,
  ) => {
    return press.execute({
      playerId,
      dimensionId: nether,
      quietTicks,
      tick,
      sneaking,
      intent,
    });
  };
  return {
    repo,
    ground,
    structures,
    session,
    world,
    feedback,
    jobs,
    clipboard,
    setTarget,
    clearTarget,
    target,
    start,
    execute,
  };
}

it("pastes at the tapped anchor and creates one undo record", () => {
  fc.assert(
    fc.property(cell, face, tick, (block, face, tick) => {
      const e = setup(block, face, tick);
      expect(e.execute()).toBe("pasted");
      expect(e.start).toHaveBeenCalledTimes(1);
      expect(e.start.mock.calls[0]).toEqual([
        e.clipboard.contents.handle,
        nether,
        e.target.anchor,
        0,
      ]);
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
      e.jobs.step();
      for (const at of cellsOf(e.target.box))
        expect(e.world.stateAt(nether, at)).toEqual(stone);
      expect(e.session.takeUndo()).toMatchObject({
        kind: "snapshot",
        snapshot: { dimensionId: nether, box: e.target.box },
      });
      expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
    }),
  );
});

it("ignores every selection flow and preserves noClipboard feedback in paste aiming", () => {
  fc.assert(
    fc.property(cell, face, tick, (block, face, tick) => {
      const e = setup(block, face, tick);
      const first = tapBlock(
        { kind: "idle" },
        nether,
        cellOf(block),
        stone,
        NETHER_RANGE,
      );
      const endpoint = confirmEndpointHeight(
        tapAir(
          first,
          cellOf({
            ...block,
            x: block.x + 2,
            z: block.z + 2,
          }),
          NETHER_RANGE,
        ),
      );
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeightedFlow(endpoint, "hip"),
      ]) {
        e.session.setFlowForTest(flow);
        expect(e.execute()).toBe("ignored");
        expect(e.session.flow).toEqual(flow);
      }
      e.repo.remove(playerId);
      expect(e.execute()).toBe("ignored");
      expect(e.repo.get(playerId)).toBeUndefined();
      const empty = e.repo.getOrCreate(playerId);
      empty.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
      expect(e.execute()).toBe("ignored");
      expect(e.feedback.messages).toEqual([{ message: "noClipboard" }]);
      expect(e.start).not.toHaveBeenCalled();
    }),
  );
});

it("refuses protected volumes and busy jobs without queuing", () => {
  fc.assert(
    fc.property(cell, face, tick, fc.boolean(), (block, face, tick, busy) => {
      const e = setup(block, face, tick);
      const flow = e.session.flow;
      if (busy) e.session.beginEdit();
      else
        e.world.protectedCells.add(
          cellKey({ ...e.target.anchor, x: e.target.anchor.x + 1 }),
        );
      expect(e.execute()).toBe("refused");
      expect(e.session.flow).toEqual(flow);
      expect(e.feedback.messages.at(-1)?.message).toBe(
        busy ? "busy" : "pasteBlocked",
      );
      expect(e.start).not.toHaveBeenCalled();
      e.jobs.step();
      expect(e.world.writes).toBe(0);
      if (busy)
        e.session.finishEdit({ dimensionId: nether, changes: [] }, "undo");
      else e.world.protectedCells.clear();
      expect(e.execute()).toBe("pasted");
      expect(e.start).toHaveBeenCalledTimes(1);
    }),
  );
});

it("can paste at the same anchor after undo clears the next target", () => {
  fc.assert(
    fc.property(
      cell,
      face,
      tick,
      fc.integer({ min: 0, max: BUILD_SPEC.pasteRepeatTicks - 1 }),
      (block, face, tick, delta) => {
        const e = setup(block, face, tick);
        expect(e.execute()).toBe("pasted");
        e.jobs.step();
        const flow = e.session.flow;
        expect(e.execute(true, "wand", delta)).toBe("ignored");
        expect(e.session.flow).toEqual(flow);
        expect(e.start).toHaveBeenCalledTimes(1);
        new UndoEdit(e.repo, e.feedback, e.jobs, e.world, e.structures, {
          warn: () => {},
        }).execute({ playerId });
        expect(e.session.flow).toEqual({
          kind: "pasteAim",
          manualTurn: 0,
        });
        expect(e.session.clipboard).toBe(e.clipboard);
        e.jobs.step();
        expect(e.world.stateAt(nether, e.target.anchor)).toBe(AIR);
        expect(e.session.hasHistory).toBe(false);
        e.setTarget();
        expect(e.execute()).toBe("pasted");
        e.jobs.step();
        expect(e.start).toHaveBeenCalledTimes(3);
        expect(e.session.takeUndo()).toMatchObject({
          kind: "snapshot",
          snapshot: { dimensionId: nether },
        });
        expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      },
    ),
  );
});

it("never writes for a plain press with or without a tap", () => {
  fc.assert(
    fc.property(
      cell,
      face,
      tick,
      fc.integer({ min: 0, max: 2 }),
      (block, face, tick, kind) => {
        const e = setup(block, face, tick);
        if (kind === 0) e.clearTarget();
        if (kind === 1) e.session.rotatePaste();
        const capture = vi.spyOn(e.structures, "capture");
        const flow = e.session.flow;
        expect(e.execute(false)).toBe("menu");
        expect(e.session.flow).toEqual(flow);
        expect(e.session.isEditing).toBe(false);
        e.jobs.step();
        expect(e.start).not.toHaveBeenCalled();
        expect(capture).not.toHaveBeenCalled();
        expect(e.world.writes).toBe(0);
      },
    ),
  );
});

it("reports a missing target for a sneak press", () => {
  fc.assert(
    fc.property(cell, face, tick, fc.boolean(), (block, face, tick, rotate) => {
      const e = setup(block, face, tick);
      e.clearTarget();
      if (rotate) e.session.rotatePaste();
      expect(e.execute(true)).toBe("ignored");
      expect(e.feedback.messages).toEqual([{ message: "pasteTapPosition" }]);
      expect(e.start).not.toHaveBeenCalled();
    }),
  );
});

it("resumes a selected clipboard on the first Place and requires a block tap before placing", () => {
  const block = cellOf({ x: 3, y: 60, z: 1 });
  const e = setup(block, "up", 0);
  e.session.setFlowForTest(selectionFlows(block, nether, stone).selected);
  expect(e.execute(false, "place")).toBe("aiming");
  expect(e.feedback.messages).toEqual([{ message: "pasteTapPosition" }]);
  expect(e.start).not.toHaveBeenCalled();
  expect(e.execute(false, "place")).toBe("ignored");
  e.setTarget();
  expect(e.execute(false, "place")).toBe("pasted");
  expect(e.start).toHaveBeenCalledTimes(1);
});

it("place hints without starting a paste during selection work or without a clipboard", () => {
  fc.assert(
    fc.property(
      cell,
      face,
      tick,
      fc.boolean(),
      (block, face, tick, sneaking) => {
        const e = setup(block, face, tick);
        const { selected, inProgress } = selectionFlows(
          cellOf(block),
          nether,
          stone,
        );
        for (const flow of inProgress) {
          e.session.setFlowForTest(flow);
          expect(e.execute(sneaking, "place")).toBe("ignored");
          expect(e.session.flow).toBe(flow);
          expect(e.feedback.messages.at(-1)?.message).toBe("pasteInactive");
        }
        e.session.clearClipboard();
        e.session.setFlowForTest(selected);
        expect(e.execute(sneaking, "place")).toBe("ignored");
        expect(e.feedback.messages.at(-1)?.message).toBe("pasteInactive");
        e.repo.remove(playerId);
        expect(e.execute(sneaking, "place")).toBe("ignored");
        expect(e.repo.get(playerId)).toBeUndefined();
        expect(e.feedback.messages.at(-1)?.message).toBe("pasteInactive");
        const empty = e.repo.getOrCreate(playerId);
        empty.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
        expect(e.execute(sneaking, "place")).toBe("ignored");
        expect(e.feedback.messages.at(-1)?.message).toBe("pasteInactive");
        expect(e.start).not.toHaveBeenCalled();
        expect(e.ground.calls).toEqual([]);
        expect(e.world.writes).toBe(0);
      },
    ),
  );
});

it("place and sneak wand share placement, refusals, and missing targets", () => {
  fc.assert(
    fc.property(
      cell,
      face,
      tick,
      fc.boolean(),
      (block, face, tick, sneaking) => {
        for (const scenario of [
          "pasted",
          "protected",
          "busy",
          "noGround",
          "noTarget",
          "limit",
        ] as const) {
          const wand = setup(block, face, tick);
          const place = setup(block, face, tick);
          for (const e of [wand, place]) {
            e.session.rotatePaste();
            if (scenario === "protected")
              vi.spyOn(e.world, "mayEdit").mockReturnValue(false);
            if (scenario === "busy") e.session.beginEdit();
            if (scenario === "noGround") e.ground.topOf = () => undefined;
            if (scenario === "noTarget") e.clearTarget();
            if (scenario === "limit")
              vi.spyOn(e.structures, "capture").mockReturnValue("tooLarge");
          }
          const result = wand.execute(true, "wand");
          expect(place.execute(sneaking, "place")).toBe(result);
          expect(result).toBe(
            scenario === "pasted"
              ? "pasted"
              : scenario === "noTarget"
                ? "ignored"
                : "refused",
          );
          expect(place.start.mock.calls).toEqual(wand.start.mock.calls);
          expect(place.session.flow).toEqual(wand.session.flow);
          expect(place.feedback.messages).toEqual(wand.feedback.messages);
          expect(place.feedback.undoHints).toEqual(wand.feedback.undoHints);
          expect(place.world.writes).toBe(wand.world.writes);
        }
      },
    ),
  );
});

it("applies the manual turn and preserves it after placement", () => {
  fc.assert(
    fc.property(cell, tick, (block, tick) => {
      const e = setup(block, "up", tick);
      expect(e.session.rotatePaste()).toBe(true);
      expect(e.execute(false, "place")).toBe("pasted");
      expect(e.start.mock.calls.map((call) => call.slice(2))).toEqual([
        [pasteTarget(e.clipboard, cellOf(block), "up", 1).anchor, 1],
      ]);
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 1 });
      expect(e.execute()).toBe("ignored");
    }),
  );
});
