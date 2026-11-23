import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import {
  boxOf,
  type CellBox,
  cellsOf,
  volume,
} from "../../../src/domain/build/box";
import { cornerTaps } from "../../../src/domain/build/flow/flow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { selectionOf } from "../../../src/domain/build/selection";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const coordinate = fc.integer({ min: -4, max: 4 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const boxArb = fc.tuple(cell, cell).map(([a, b]) => boxOf(a, b));

function setup(box: CellBox) {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const structures = new FakeStructureStore(world);
  const log = { warn: vi.fn() };
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    log,
    new FakeBuildPlayers(),
    structures,
  );
  const undo = new UndoEdit(repo, feedback, jobs, world, structures, log);
  const session = repo.getOrCreate(playerId);
  const handle = structures.capture(overworld, box, playerId, "exact");
  if (handle === "tooLarge" || handle === "unreadable") throw new Error(handle);
  session.recordSnapshot({ dimensionId: overworld, box, handle });
  session.setFlow({
    kind: "pasteAim",
    manualTurn: 0,
  });
  structures.calls.length = 0;
  return {
    repo,
    world,
    feedback,
    structures,
    log,
    jobs,
    undo,
    session,
    handle,
  };
}

it("restores the snapshot before discarding it and keeps paste aiming", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup(box);
      e.world.put(box.min, blockStateOf("minecraft:stone"));
      const clear = vi.spyOn(e.structures, "clearEntities");
      const place = vi.spyOn(e.structures, "place");
      const discard = vi.spyOn(e.structures, "discard");
      const mayRestore = vi.spyOn(e.world, "mayRestore");
      e.undo.execute({ playerId });
      expect(new Set(mayRestore.mock.calls)).toEqual(
        new Set([...cellsOf(box)].map((cell) => [overworld, cell])),
      );
      expect(clear).toHaveBeenCalledWith(overworld, box);
      expect(clear).toHaveBeenCalledBefore(place);
      expect(place).toHaveBeenCalledBefore(discard);
      expect(e.structures.live.size).toBe(0);
      expect(e.feedback.messages).toEqual([
        { message: "undoDone", count: volume(box) },
      ]);
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
      expect(e.session.isEditing).toBe(false);
      expect(e.world.stateAt(overworld, box.min)).toEqual(AIR);
      expect(e.log.warn).not.toHaveBeenCalled();
    }),
  );
});

it.each([
  "matching",
  "rotated",
  "another edit",
  "wrong dimension",
  "no clipboard",
] as const)("undoes with a %s selection or session", (situation) => {
  const box = boxOf({ x: 0, y: 64, z: 0 }, { x: 2, y: 64, z: 0 });
  const e = setup(box);
  e.session.takeUndo();
  const material = blockStateOf("minecraft:stone");
  const selection = selectionOf(overworld, box, material);
  const clipboard = {
    material,
    size: { x: 3, y: 1, z: 1 },
    blockCount: 3,
    facing: "east" as const,
    contents: { kind: "structure" as const, handle: e.handle },
  };
  e.session.completeCopy(selection, clipboard);
  const paste = new PasteAt(
    e.repo,
    e.world,
    e.feedback,
    e.structures,
    new FakeBuildPlayers(),
  );
  expect(
    paste.execute({
      playerId,
      dimensionId: overworld,
      target: { box, anchor: box.min, turn: 0 },
    }),
  ).toBe("pasted");
  if (situation === "rotated") {
    const target = planRotationAboutCenter(box).target;
    e.session.replaceSelection(
      selectionOf(overworld, target, material),
      cornerTaps(target),
    );
  }
  if (situation === "another edit")
    e.session.finishEdit(
      {
        dimensionId: overworld,
        changes: [{ cell: box.min, before: AIR, after: material }],
      },
      "undoable",
    );
  if (situation === "wrong dimension")
    e.session.replaceSelection(
      selectionOf(nether, box, material),
      cornerTaps(box),
    );
  if (situation === "no clipboard") e.session.clearClipboard();
  const flow = e.session.flow;
  e.undo.execute({ playerId });
  if (situation === "matching") {
    expect(e.session.flow).toEqual(beginPasteAim());
    expect(e.session.clipboard).toBe(clipboard);
    expect(e.structures.live.has(e.handle)).toBe(true);
  } else {
    expect(e.session.flow).toBe(flow);
  }
});

it("restores snapshots containing laid cells while retaining space protection", () => {
  fc.assert(
    fc.property(
      boxArb,
      fc.nat(),
      fc.nat(),
      fc.boolean(),
      (box, index, blockedIndex, protectedCell) => {
        const e = setup(box);
        const cells = [...cellsOf(box)];
        const laidCells = cells.slice(index % cells.length);
        for (const cell of laidCells) {
          e.world.laidCells.add(cellKey(cell));
        }
        const blocked = cells[blockedIndex % cells.length];
        if (!blocked) throw new Error("Empty box");
        const flow = e.session.flow;
        if (protectedCell) {
          e.world.protectedCells.add(cellKey(blocked));
          e.undo.execute({ playerId });
          expect(e.structures.calls).toEqual([]);
          expect(e.feedback.messages).toEqual([
            { message: "pasteBlocked", count: undefined },
          ]);
          expect(e.structures.live.has(e.handle)).toBe(true);
          expect(e.session.hasHistory).toBe(true);
          expect(e.session.flow).toBe(flow);
          e.world.protectedCells.clear();
        }
        e.world.put(blocked, blockStateOf("minecraft:stone"));
        e.undo.execute({ playerId });
        expect(e.world.stateAt(overworld, blocked)).toEqual(AIR);
        expect(e.structures.calls).toContainEqual({
          kind: "place",
          turn: 0,
          handle: e.handle,
          dimensionId: overworld,
          anchor: box.min,
        });
        expect(e.log.warn).not.toHaveBeenCalled();
        expect(e.feedback.messages.at(-1)).toEqual({
          message: "undoDone",
          count: volume(box),
        });
        expect(e.structures.live.size).toBe(0);
        expect(e.session.takeUndo()).toBe("nothingToUndo");
      },
    ),
  );
});

it("discards a failed placement, consumes history and warns once without changing the flow", () => {
  const box = boxOf({ x: 0, y: 64, z: 0 }, { x: 2, y: 66, z: 2 });
  const e = setup(box);
  const flow = e.session.flow;
  e.structures.placeSucceeds = false;
  e.undo.execute({ playerId });
  expect(e.structures.calls).toContainEqual({
    kind: "place",
    turn: 0,
    handle: e.handle,
    dimensionId: overworld,
    anchor: box.min,
  });
  expect(e.structures.live.size).toBe(0);
  expect(e.feedback.messages).toEqual([
    { message: "undoFailed", count: undefined },
  ]);
  expect(e.session.flow).toBe(flow);
  expect(e.session.takeUndo()).toBe("nothingToUndo");
  expect(e.log.warn).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(e.handle),
  );
});

it("still sends cell records through edit jobs and keeps busy and empty refusals", () => {
  const cell = { x: 0, y: 64, z: 0 };
  const e = setup(boxOf(cell, cell));
  e.session.takeUndo();
  e.structures.discard(e.handle);
  e.structures.calls.length = 0;
  const after = blockStateOf("minecraft:stone");
  e.world.put(cell, after);
  e.session.finishEdit(
    { dimensionId: overworld, changes: [{ cell, before: AIR, after }] },
    "undoable",
  );
  e.session.beginEdit();
  e.undo.execute({ playerId });
  expect(e.feedback.messages.at(-1)?.message).toBe("busy");
  expect(e.session.hasHistory).toBe(true);
  e.session.finishEdit({ dimensionId: overworld, changes: [] }, "undo");
  e.undo.execute({ playerId });
  expect(e.session.isEditing).toBe(true);
  expect(e.world.stateAt(overworld, cell)).toEqual(after);
  e.jobs.step();
  expect(e.world.stateAt(overworld, cell)).toEqual(AIR);
  expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
  expect(e.structures.calls).toEqual([]);
  e.undo.execute({ playerId });
  expect(e.feedback.messages.at(-1)?.message).toBe("nothingToUndo");
});

it("retries a blocked newest snapshot before older snapshot and cell entries", () => {
  const cell = { x: 0, y: 64, z: 0 };
  const box = boxOf(cell, cell);
  const e = setup(box);
  const older = e.session.takeUndo();
  if (typeof older === "string") throw new Error(older);
  const after = blockStateOf("minecraft:stone");
  e.world.put(cell, after);
  e.session.finishEdit(
    { dimensionId: overworld, changes: [{ cell, before: AIR, after }] },
    "undoable",
  );
  e.session.putBackUndo(older);
  const newest = e.structures.capture(overworld, box, playerId, "exact");
  if (newest === "tooLarge" || newest === "unreadable") throw new Error(newest);
  e.session.recordSnapshot({ dimensionId: overworld, box, handle: newest });
  e.structures.calls.length = 0;
  const guard = vi.spyOn(e.world, "mayRestore").mockReturnValue(false);
  e.undo.execute({ playerId });
  expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
  expect(e.structures.calls).toEqual([]);
  guard.mockReturnValue(true);
  e.undo.execute({ playerId });
  e.undo.execute({ playerId });
  expect(e.structures.calls.filter((call) => call.kind === "discard")).toEqual([
    { kind: "discard", handle: newest },
    { kind: "discard", handle: e.handle },
  ]);
  e.undo.execute({ playerId });
  e.jobs.step();
  expect(e.world.stateAt(overworld, cell)).toEqual(AIR);
  expect(e.session.takeUndo()).toBe("nothingToUndo");
});
