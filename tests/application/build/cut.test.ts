import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ChooseBoxStep } from "../../../src/application/build/chooseBoxStep";
import { CopyBox } from "../../../src/application/build/copyBox";
import { CutBox } from "../../../src/application/build/cutBox";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/heightFlow";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";
import { confirmEndpointHeight } from "../../support/buildSelection";
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
  const structures = new FakeStructureStore(world);
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
    choose: new ChooseBoxStep(repo, actions, feedback, {
      facingOf: () => "east",
    }),
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
        const capture = vi.spyOn(e.structures, "capture");
        const box = boxOf(origin, { x: x - 1, y: 63 + y, z: z - 1 });
        for (const cell of cellsOf(box))
          e.world.put(cell, blockStateOf("minecraft:chest"));
        expect(
          e.cut.execute({
            playerId,
            selection: selectionOf(overworld, box, stone),
            facing: "east",
          }),
        ).toBe(true);
        const handleFor = (mode: "copy" | "exact") =>
          capture.mock.results[
            capture.mock.calls.findIndex(
              ([, , , capturedMode]) => capturedMode === mode,
            )
          ]?.value;
        const clipboard = handleFor("copy");
        const snapshot = handleFor("exact");
        expect(e.structures.live).toEqual(new Set([clipboard, snapshot]));
        const firstClear = e.structures.calls.findIndex(
          (c) => c.kind === "clearEntities" || c.kind === "clearBlocks",
        );
        const captures = e.structures.calls.slice(0, firstClear);
        for (const mode of ["copy", "exact"]) {
          expect(captures).toContainEqual({
            kind: "capture",
            dimensionId: overworld,
            box,
            ownerId: playerId,
            mode,
          });
        }
        expect(e.structures.calls).toContainEqual({
          kind: "clearEntities",
          dimensionId: overworld,
          box,
        });
        for (const cell of cellsOf(box))
          expect(e.world.stateAt(overworld, cell)).toEqual(AIR);
        expect(e.session.clipboard).toEqual({
          material: stone,
          size: { x, y, z },
          blockCount: x * y * z,
          facing: "east",
          contents: { kind: "structure", handle: clipboard },
        });
        expect(e.session.confirmedBox).toEqual({
          material: stone,
          dimensionId: overworld,
          box,
        });
        expect(e.feedback.undoHints).toEqual([]);
        expect(e.session.flow.kind).toBe("pasteAim");
        expect(e.session.isEditing).toBe(false);
        expect(e.session.takeUndo()).toEqual({
          kind: "snapshot",
          snapshot: { dimensionId: overworld, box, handle: snapshot },
        });
        expect(e.feedback.messages.at(-1)).toMatchObject({
          message: "editDoneCount",
          count: x * y * z,
        });
      },
    ),
  );
});

it("discards the old clipboard and retains its snapshot only after clearing succeeds", () => {
  const e = setup();
  const box = boxOf(origin, origin);
  e.cut.execute({
    playerId,
    selection: selectionOf(overworld, box, stone),
    facing: "east",
  });
  const [clipboard, snapshot] = [...e.structures.live];
  e.cut.execute({
    playerId,
    selection: selectionOf(overworld, box, stone),
    facing: "east",
  });
  expect([...e.structures.live]).not.toContain(clipboard);
  expect(e.structures.live.size).toBe(3);
  expect(snapshot).toBeDefined();
  expect([...e.structures.live]).toContain(snapshot);
  expect(e.feedback.undoHints).toEqual([]);
});

it.each(["tooLarge", "unreadable"] as const)(
  "rolls back either capture refusal: %s",
  (refusal) => {
    for (const second of [false, true]) {
      const e = setup();
      const box = boxOf(origin, origin);
      const clipboard = structureClipboard(box, () => stone);
      e.session.completeCopy(selectionOf(overworld, box, stone), clipboard);
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
      expect(
        e.cut.execute({
          playerId,
          selection: selectionOf(overworld, box, stone),
          facing: "east",
        }),
      ).toBe(false);
      expect(e.session.flow).toBe(flow);
      expect(e.session.confirmedBox).toBe(confirmed);
      expect(e.session.clipboard).toBe(clipboard);
      expect(e.session.takeUndo()).toEqual({ kind: "cells", record });
      expect(e.structures.live.size).toBe(0);
      expect(e.structures.calls.some((c) => c.kind === "clearEntities")).toBe(
        false,
      );
      expect(e.world.writes).toBe(0);
      expect(e.feedback.messages.at(-1)).toMatchObject({
        message: refusal === "tooLarge" ? "tooLarge" : "copyUnreadable",
        count: refusal === "tooLarge" ? 1 : undefined,
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
      expect(
        e.cut.execute({
          playerId,
          selection: selectionOf(overworld, box, stone),
          facing: "east",
        }),
      ).toBe(false);
      expect(e.structures.calls).toEqual([]);
      expect(e.session.flow).toBe(flow);
      expect(e.session.hasHistory).toBe(false);
      expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
    }),
  );
});

it("refuses a laid cell anywhere in the box before capturing or clearing", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 26 }), (index) => {
      const e = setup();
      const box = boxOf(origin, { x: 2, y: 66, z: 2 });
      const cell = [...cellsOf(box)][index];
      if (!cell) throw new Error("Missing source cell");
      const clipboard = structureClipboard(box, () => stone);
      e.session.completeCopy(selectionOf(overworld, box, stone), clipboard);
      e.session.beginEdit();
      e.session.finishEdit(
        {
          dimensionId: overworld,
          changes: [
            {
              cell: origin,
              before: blockStateOf("minecraft:air"),
              after: stone,
            },
          ],
        },
        "undoable",
      );
      const before = structuredClone(e.session);
      e.world.laidCells.add(cellKey(cell));
      expect(
        e.cut.execute({
          playerId,
          selection: selectionOf(overworld, box, stone),
          facing: "east",
        }),
      ).toBe(false);
      expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
      expect(e.structures.calls).toEqual([]);
      expect(e.world.writes).toBe(0);
      expect(e.session).toEqual(before);
      expect(e.session.clipboard).toBe(clipboard);
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
        if (previousCut)
          e.cut.execute({
            playerId,
            selection: selectionOf(overworld, oldBox, stone),
            facing: "east",
          });
        const previousHandles = [...e.structures.live];
        const clipboard = e.session.clipboard;
        const confirmed = e.session.confirmedBox;
        const flow = confirmEndpointHeight(
          tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), {
            x,
            y: 65,
            z: 1,
          }),
        );
        e.session.setFlow(flow);
        const before = structuredClone(e.session);
        e.structures.calls.length = 0;
        e.feedback.messages.length = 0;
        e.feedback.undoHints.length = 0;
        e.structures.clearBlocksSucceeds = false;
        const box = boxOf({ x, y: 65, z: 1 }, { x: x + 1, y: 66, z: 2 });
        expect(
          e.cut.execute({
            playerId,
            selection: selectionOf(overworld, box, stone),
            facing: "east",
          }),
        ).toBe(false);
        expect(e.session).toEqual(before);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(confirmed);
        expect(e.session.flow).toBe(flow);
        expect([...e.structures.live]).toEqual(previousHandles);
        const rollback = e.structures.calls.find((c) => c.kind === "place");
        expect(rollback).toMatchObject({
          kind: "place",
          turn: 0,
          dimensionId: overworld,
          anchor: box.min,
        });
        if (rollback?.kind !== "place") throw new Error("missing rollback");
        expect(
          e.structures.calls.slice(e.structures.calls.indexOf(rollback) + 1),
        ).toContainEqual({ kind: "discard", handle: rollback.handle });
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
    if (previousCut)
      e.cut.execute({
        playerId,
        selection: selectionOf(overworld, box, stone),
        facing: "east",
      });
    const previousHandles = [...e.structures.live];
    e.structures.calls.length = 0;
    e.feedback.messages.length = 0;
    e.feedback.undoHints.length = 0;
    e.structures.clearBlocksSucceeds = false;
    e.structures.placeSucceeds = false;
    expect(
      e.cut.execute({
        playerId,
        selection: selectionOf(overworld, box, stone),
        facing: "east",
      }),
    ).toBe(true);
    const [clipboard, snapshot] = [...e.structures.live].slice(-2);
    expect(e.structures.calls).toContainEqual({
      kind: "place",
      turn: 0,
      handle: snapshot,
      dimensionId: overworld,
      anchor: box.min,
    });
    expect(e.structures.live).toEqual(
      new Set([...previousHandles.slice(1), clipboard, snapshot]),
    );
    expect(e.session.clipboard?.contents).toEqual({
      kind: "structure",
      handle: clipboard,
    });
    expect(e.session.confirmedBox).toEqual({
      material: stone,
      dimensionId: overworld,
      box,
    });
    expect(e.session.takeUndo()).toEqual({
      kind: "snapshot",
      snapshot: { dimensionId: overworld, box, handle: snapshot },
    });
    expect(e.session.flow.kind).toBe("pasteAim");
    expect(e.feedback.messages).toEqual([
      { message: "cutIncomplete", count: undefined },
    ]);
    expect(e.feedback.undoHints).toEqual([]);
    expect(e.session.takeUndoHint()).toBe(true);
    expect(e.log.warn).toHaveBeenCalledOnce();
  },
);

it.each(["tooLarge", "busy"] as const)(
  "preserves the selection and old clipboard when Cut reports %s",
  (refusal) => {
    const e = setup();
    const end = {
      ...origin,
      x: refusal === "tooLarge" ? BUILD_SPEC.maxCopyVolume : 1,
      z: 1,
    };
    const flow = confirmEndpointHeight(
      tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), end),
    );
    const previous = boxOf(origin, origin);
    const clipboard = structureClipboard(previous, () => stone);
    e.session.completeCopy(selectionOf(overworld, previous, stone), clipboard);
    e.session.setFlow(flow);
    const confirmed = e.session.confirmedBox;
    if (refusal === "busy") e.session.beginEdit();
    e.choose.execute({ playerId, kind: "cut" });
    expect(e.feedback.messages.at(-1)?.message).toBe(refusal);
    expect(e.session.flow).toBe(flow);
    expect(e.session.confirmedBox).toBe(confirmed);
    expect(e.session.clipboard).toBe(clipboard);
    expect(e.structures.calls).toEqual([]);
  },
);
it("cuts every selected shape directly", () => {
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
          confirmEndpointHeight(
            tapAir(tapBlock({ kind: "idle" }, overworld, origin, stone), end),
          ),
        );
        e.choose.execute({ playerId, kind: "cut" });
        expect(e.session.flow.kind).toBe("pasteAim");
        expect(e.session.isEditing).toBe(false);
        expect(e.world.stateAt(overworld, origin)).toEqual(AIR);
        expect(e.session.confirmedBox).toEqual({
          material: stone,
          dimensionId: overworld,
          box,
        });

        expect(e.session.clipboard?.contents.kind).toBe("structure");
      },
    ),
  );
});

it("accepts the copy-volume boundary even when the entire box is air", () => {
  const e = setup();
  const box = boxOf(origin, { x: 31, y: 95, z: 31 });
  expect(
    e.cut.execute({
      playerId,
      selection: selectionOf(overworld, box, stone),
      facing: "east",
    }),
  ).toBe(true);
  expect(e.session.clipboard?.blockCount).toBe(BUILD_SPEC.maxCopyVolume);
  expect(e.session.hasHistory).toBe(true);
});
