import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { ConfirmBoxStep } from "../../../src/application/build/confirmBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  setHeight,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import {
  cellKey,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const stone = blockStateOf("minecraft:stone", { stone_type: "granite" });
const origin = { x: 0, y: 64, z: 0 };
function setup() {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  const world = new FakeWorld();
  const structures = new FakeStructureStore();
  const log = { warn: vi.fn() };
  const session = repo.getOrCreate(playerId);
  const cut = new CutBox(repo, world, structures, feedback, log);
  const actions = {
    copy: new CopyBox(repo, new FakeStructureStore(), feedback),
    cut,
  };
  return {
    repo,
    feedback,
    world,
    session,
    cut,
    structures,
    log,
    choose: new ChooseBoxStep(repo, actions, feedback),
    confirm: new ConfirmBoxStep(repo, actions, feedback),
  };
}

it("captures the whole box twice before removing anything and records a snapshot", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      (x, y, z) => {
        const e = setup();
        const box = boxOf(origin, { x: x - 1, y: 63 + y, z: z - 1 });
        e.world.put(origin, blockStateOf("minecraft:chest"));
        expect(e.cut.execute(playerId, overworld, box)).toBe(true);
        const [clipboard, snapshot] = [...e.structures.live];
        expect(e.structures.calls).toEqual([
          { kind: "capture", dimensionId: overworld, box, ownerId: playerId },
          { kind: "capture", dimensionId: overworld, box, ownerId: playerId },
          { kind: "clearEntities", dimensionId: overworld, box },
          { kind: "clearBlocks", dimensionId: overworld, box },
        ]);
        expect(e.session.clipboard).toEqual({
          size: { x, y, z },
          blockCount: x * y * z,
          contents: { kind: "structure", handle: clipboard },
        });
        expect(e.session.confirmedBox).toEqual({ dimensionId: overworld, box });
        expect(e.feedback.undoHints).toEqual([playerId]);
        expect(e.session.flow.kind).toBe("pasteAim");
        expect(e.session.isEditing).toBe(false);
        expect(e.session.takeUndo()).toEqual({
          kind: "snapshot",
          snapshot: { dimensionId: overworld, box, handle: snapshot },
        });
        expect(e.feedback.messages.at(-1)).toMatchObject({
          message: "editDone",
          count: x * y * z,
        });
      },
    ),
  );
});

it("discards the old clipboard and snapshot only after clearing succeeds", () => {
  const e = setup();
  const box = boxOf(origin, origin);
  e.cut.execute(playerId, overworld, box);
  const [clipboard, snapshot] = [...e.structures.live];
  e.structures.calls.length = 0;
  e.cut.execute(playerId, overworld, box);
  expect(e.structures.calls.map((c) => c.kind)).toEqual([
    "capture",
    "capture",
    "clearEntities",
    "clearBlocks",
    "discard",
    "discard",
  ]);
  expect(e.structures.calls.slice(4, 6)).toEqual([
    { kind: "discard", handle: clipboard },
    { kind: "discard", handle: snapshot },
  ]);
  expect(e.structures.live.size).toBe(2);
  expect(e.feedback.undoHints).toEqual([playerId]);
});

it.each(["tooLarge", "unreadable"] as const)(
  "rolls back either capture refusal: %s",
  (refusal) => {
    for (const second of [false, true]) {
      const e = setup();
      const box = boxOf(origin, origin);
      const clipboard = structureClipboard(box, () => stone);
      e.session.completeCopy(overworld, box, clipboard);
      e.session.beginEdit();
      const record = {
        dimensionId: overworld,
        changes: [
          { cell: origin, before: blockStateOf("minecraft:air"), after: stone },
        ],
      };
      e.session.finishEdit(record, "undoable");
      const flow = e.session.flow;
      const confirmed = e.session.confirmedBox;
      e.structures.captureRefusals = second ? [undefined, refusal] : [refusal];
      expect(e.cut.execute(playerId, overworld, box)).toBe(false);
      expect(e.session.flow).toBe(flow);
      expect(e.session.confirmedBox).toBe(confirmed);
      expect(e.session.clipboard).toBe(clipboard);
      expect(e.session.takeUndo()).toEqual({ kind: "cells", record });
      expect(e.structures.live.size).toBe(0);
      expect(e.structures.calls.map((c) => c.kind)).toEqual(
        second ? ["capture", "capture", "discard"] : ["capture"],
      );
      expect(e.feedback.messages.at(-1)).toMatchObject({
        message: "tooLarge",
        count: 1,
      });
    }
  },
);

it("refuses the entire box when any cell is protected", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 26 }), (index) => {
      const e = setup();
      const box = boxOf(origin, { x: 2, y: 66, z: 2 });
      const cell = [...cellsOf(box)][index];
      if (!cell) throw new Error("missing cell");
      e.world.protectedCells.add(cellKey(cell));
      const flow = e.session.flow;
      expect(e.cut.execute(playerId, overworld, box)).toBe(false);
      expect(e.structures.calls).toEqual([]);
      expect(e.session.flow).toBe(flow);
      expect(e.session.hasHistory).toBe(false);
      expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
    }),
  );
});

it("restores failed cuts without changing the session or discarding prior handles", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: -20, max: 20 }),
      (previousCut, x) => {
        const e = setup();
        const oldBox = boxOf(origin, origin);
        if (previousCut) e.cut.execute(playerId, overworld, oldBox);
        const previousHandles = [...e.structures.live];
        const clipboard = e.session.clipboard;
        const confirmed = e.session.confirmedBox;
        const flow = tapAir(
          tapBlock({ kind: "idle" }, overworld, origin, stone),
          { x, y: 65, z: 1 },
        );
        e.session.setFlow(flow);
        const before = structuredClone(e.session);
        e.structures.calls.length = 0;
        e.feedback.messages.length = 0;
        e.feedback.undoHints.length = 0;
        e.structures.clearBlocksSucceeds = false;
        const box = boxOf({ x, y: 65, z: 1 }, { x: x + 1, y: 66, z: 2 });
        expect(e.cut.execute(playerId, overworld, box)).toBe(false);
        expect(e.session).toEqual(before);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(confirmed);
        expect(e.session.flow).toBe(flow);
        expect([...e.structures.live]).toEqual(previousHandles);
        const rollback = e.structures.calls[4];
        expect(rollback).toMatchObject({
          kind: "place",
          turn: 0,
          dimensionId: overworld,
          anchor: box.min,
        });
        if (rollback?.kind !== "place") throw new Error("missing rollback");
        expect(e.structures.calls.map((c) => c.kind)).toEqual([
          "capture",
          "capture",
          "clearEntities",
          "clearBlocks",
          "place",
          "discard",
          "discard",
        ]);
        expect(e.structures.calls[6]).toEqual({
          kind: "discard",
          handle: rollback.handle,
        });
        expect(e.structures.calls[5]).not.toEqual(e.structures.calls[6]);
        expect(e.session.takeUndo()).toEqual(
          previousCut
            ? {
                kind: "snapshot",
                snapshot: {
                  dimensionId: overworld,
                  box: oldBox,
                  handle: previousHandles[1],
                },
              }
            : "nothingToUndo",
        );
        expect(e.feedback.messages).toEqual([
          { message: "cutRestored", count: undefined },
        ]);
        expect(e.feedback.undoHints).toEqual([]);
        expect(e.log.warn).toHaveBeenCalledOnce();
      },
    ),
  );
});

it.each([false, true])(
  "keeps a failed rollback recoverable with previous cut %s",
  (previousCut) => {
    const e = setup();
    const box = boxOf(origin, origin);
    if (previousCut) e.cut.execute(playerId, overworld, box);
    const previousHandles = [...e.structures.live];
    e.structures.calls.length = 0;
    e.feedback.messages.length = 0;
    e.feedback.undoHints.length = 0;
    e.structures.clearBlocksSucceeds = false;
    e.structures.placeSucceeds = false;
    expect(e.cut.execute(playerId, overworld, box)).toBe(true);
    const [clipboard, snapshot] = [...e.structures.live];
    expect(e.structures.calls).toEqual([
      { kind: "capture", dimensionId: overworld, box, ownerId: playerId },
      { kind: "capture", dimensionId: overworld, box, ownerId: playerId },
      { kind: "clearEntities", dimensionId: overworld, box },
      { kind: "clearBlocks", dimensionId: overworld, box },
      {
        kind: "place",
        turn: 0,
        handle: snapshot,
        dimensionId: overworld,
        anchor: box.min,
      },
      ...previousHandles.map((handle) => ({ kind: "discard", handle })),
    ]);
    expect(e.session.clipboard?.contents).toEqual({
      kind: "structure",
      handle: clipboard,
    });
    expect(e.session.confirmedBox).toEqual({ dimensionId: overworld, box });
    expect(e.session.takeUndo()).toEqual({
      kind: "snapshot",
      snapshot: { dimensionId: overworld, box, handle: snapshot },
    });
    expect(e.session.flow.kind).toBe("pasteAim");
    expect(e.feedback.messages).toEqual([
      { message: "cutIncomplete", count: undefined },
    ]);
    expect(e.feedback.undoHints).toEqual([]);
    expect(e.session.takeUndoHint()).toBe(!previousCut);
    expect(e.log.warn).toHaveBeenCalledOnce();
  },
);

it.each(["direct", "height"] as const)(
  "refuses oversized and busy %s cuts without changing selection or the old clipboard",
  (path) => {
    for (const refusal of ["tooLarge", "busy"] as const) {
      const e = setup();
      const end = { x: 1, y: 64, z: 1 };
      const endpoint = tapAir(
        tapBlock({ kind: "idle" }, overworld, origin, stone),
        end,
      );
      const box = boxOf(origin, origin);
      const clipboard = structureClipboard(box, () => stone);
      e.session.completeCopy(overworld, box, clipboard);
      const flow =
        path === "height"
          ? setHeight(
              chooseHeighted(endpoint, "cut"),
              refusal === "tooLarge" ? BUILD_SPEC.maxCopyVolume : 1,
            )
          : tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), {
              ...origin,
              x: refusal === "tooLarge" ? BUILD_SPEC.maxCopyVolume : 1,
            });
      e.session.setFlow(flow);
      const confirmed = e.session.confirmedBox;
      if (refusal === "busy") e.session.beginEdit();
      if (path === "height") e.confirm.execute({ playerId });
      else e.choose.execute({ playerId, kind: "cut" });
      expect(e.feedback.messages.at(-1)?.message).toBe(refusal);
      expect(e.session.flow).toBe(flow);
      expect(e.session.confirmedBox).toBe(confirmed);
      expect(e.session.clipboard).toBe(clipboard);
      expect(e.world.writes).toBe(0);
      expect(e.structures.calls).toEqual([]);
    }
  },
);

it("shares the upward height step and cuts immediately on confirmation", () => {
  const e = setup();
  const end = { x: 1, y: 64, z: 1 };
  e.session.setFlow(
    tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), end),
  );
  e.world.put({ ...origin, y: 66 }, stone);
  e.choose.execute({ playerId, kind: "cut" });
  expect(e.session.flow).toMatchObject({
    kind: "heightStep",
    heightedKind: "cut",
    previous: 1,
  });
  expect(e.session.isEditing).toBe(false);
  e.session.setFlow(setHeight(e.session.flow, 3));
  e.confirm.execute({ playerId });
  expect(e.structures.calls.at(-1)?.kind).toBe("clearBlocks");
  expect(e.session.confirmedBox?.box.max.y).toBe(66);
});

it("cuts all other shapes directly and reserves height selection for horizontal rectangles", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -4, max: 4 }),
        y: fc.integer({ min: -4, max: 4 }),
        z: fc.integer({ min: -4, max: 4 }),
      }),
      (delta) => {
        const e = setup();
        const end = {
          x: origin.x + delta.x,
          y: origin.y + delta.y,
          z: origin.z + delta.z,
        };
        const box = boxOf(origin, end);
        e.world.put(origin, stone);
        e.session.setFlow(
          tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), end),
        );
        e.choose.execute({ playerId, kind: "cut" });
        const shape = shapeOf(origin, end);
        if (shape.kind === "rect" && shape.flat === "y") {
          expect(e.session.flow).toMatchObject({
            kind: "heightStep",
            heightedKind: "cut",
          });
          expect(e.session.isEditing).toBe(false);
        } else {
          expect(e.session.flow.kind).toBe("pasteAim");
          expect(e.session.isEditing).toBe(false);
          expect(e.structures.calls.at(-1)?.kind).toBe("clearBlocks");
          expect(e.session.confirmedBox).toEqual({
            dimensionId: overworld,
            box,
          });
        }
        if (!(shape.kind === "rect" && shape.flat === "y"))
          expect(e.session.clipboard?.contents.kind).toBe("structure");
      },
    ),
  );
});

it("accepts the copy-volume boundary even when the entire box is air", () => {
  const e = setup();
  const box = boxOf(origin, { x: 31, y: 95, z: 31 });
  expect(e.cut.execute(playerId, overworld, box)).toBe(true);
  expect(e.session.clipboard?.blockCount).toBe(BUILD_SPEC.maxCopyVolume);
  expect(e.session.hasHistory).toBe(true);
});
