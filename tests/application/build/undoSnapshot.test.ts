import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import {
  boxOf,
  type CellBox,
  cellsOf,
  volume,
} from "../../../src/domain/build/box";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
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
  const structures = new FakeStructureStore();
  const log = { warn: vi.fn() };
  const jobs = new EditJobs(repo, world, feedback, log, new FakeBuildPlayers());
  const undo = new UndoEdit(repo, feedback, jobs, world, structures, log);
  const session = repo.getOrCreate(playerId);
  const handle = structures.capture(overworld, box, playerId);
  if (handle === "tooLarge" || handle === "unreadable") throw new Error(handle);
  session.recordSnapshot({ dimensionId: overworld, box, handle });
  session.setFlow({
    kind: "pasteAim",
    skipAir: true,
    lastPaste: { anchor: box.min, tick: 12 },
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

it("restores any snapshot in order, discards it and clears the paste repeat marker", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const e = setup(box);
      const mayEdit = vi.spyOn(e.world, "mayEdit");
      e.undo.execute({ playerId });
      expect(mayEdit.mock.calls).toEqual(
        [...cellsOf(box)].map((cell) => [overworld, cell]),
      );
      expect(e.structures.calls).toEqual([
        { kind: "clearEntities", dimensionId: overworld, box },
        {
          kind: "place",
          handle: e.handle,
          dimensionId: overworld,
          anchor: box.min,
        },
        { kind: "discard", handle: e.handle },
      ]);
      expect(e.structures.live.size).toBe(0);
      expect(e.feedback.messages).toEqual([
        { message: "undoDone", count: volume(box) },
      ]);
      expect(e.session.flow).toEqual({ kind: "pasteAim", skipAir: true });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
      expect(e.session.isEditing).toBe(false);
      expect(e.world.writes).toBe(0);
      expect(e.log.warn).not.toHaveBeenCalled();
    }),
  );
});

it("keeps a snapshot refused at any protected cell so the next Undo retries it", () => {
  fc.assert(
    fc.property(boxArb, fc.nat(), (box, index) => {
      const e = setup(box);
      const cells = [...cellsOf(box)];
      const blocked = cells[index % cells.length];
      if (!blocked) throw new Error("Empty box");
      e.world.protectedCells.add(cellKey(blocked));
      const flow = e.session.flow;
      e.undo.execute({ playerId });
      expect(e.feedback.messages).toEqual([
        { message: "pasteBlocked", count: undefined },
      ]);
      expect(e.structures.calls).toEqual([]);
      expect(e.structures.live.has(e.handle)).toBe(true);
      expect(e.session.hasHistory).toBe(true);
      expect(e.session.flow).toBe(flow);
      e.world.protectedCells.clear();
      e.undo.execute({ playerId });
      expect(e.structures.calls[1]).toEqual({
        kind: "place",
        handle: e.handle,
        dimensionId: overworld,
        anchor: box.min,
      });
      expect(e.feedback.messages.at(-1)).toEqual({
        message: "undoDone",
        count: volume(box),
      });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
      expect(e.log.warn).not.toHaveBeenCalled();
    }),
  );
});

it("discards a failed placement, consumes history and warns once without changing the flow", () => {
  const box = boxOf({ x: 0, y: 64, z: 0 }, { x: 2, y: 66, z: 2 });
  const e = setup(box);
  const flow = e.session.flow;
  e.structures.placeSucceeds = false;
  e.undo.execute({ playerId });
  expect(e.structures.calls).toEqual([
    { kind: "clearEntities", dimensionId: overworld, box },
    {
      kind: "place",
      handle: e.handle,
      dimensionId: overworld,
      anchor: box.min,
    },
    { kind: "discard", handle: e.handle },
  ]);
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
  expect(e.session.flow).toEqual({ kind: "pasteAim", skipAir: true });
  expect(e.structures.calls).toEqual([]);
  e.undo.execute({ playerId });
  expect(e.feedback.messages.at(-1)?.message).toBe("nothingToUndo");
});
