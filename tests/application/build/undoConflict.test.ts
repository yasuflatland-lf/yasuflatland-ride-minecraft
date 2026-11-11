import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
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
const cell = { x: 0, y: 64, z: 0 };
const before = blockStateOf("minecraft:dirt");
const after = blockStateOf("minecraft:stone");

function setup() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const jobs = new EditJobs(
    repo,
    world,
    feedback,
    { warn: () => {} },
    new FakeBuildPlayers(),
    { discard: () => {} },
  );
  const session = repo.getOrCreate(playerId);
  return {
    repo,
    world,
    feedback,
    jobs,
    session,
    undo: new UndoEdit(repo, feedback, jobs, world, new FakeStructureStore(), {
      warn: () => {},
    }),
  };
}

function oneCell() {
  const e = setup();
  e.world.put(cell, before);
  e.session.beginEdit();
  e.jobs.start(playerId, overworld, [{ cell, after }], "undoable");
  e.jobs.step();
  return e;
}

describe("Undo conflicts", () => {
  it("preserves later edits and counts conflicts and unavailable restores", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(
              "minecraft:stone",
              "minecraft:dirt",
              "minecraft:oak_stairs",
            ),
            state: fc.integer({ min: 0, max: 10 }),
            later: fc.constantFrom(
              "untouched",
              "reverted",
              "conflict",
              "sameAfter",
            ),
            guard: fc.constantFrom("none", "protected", "unreadable", "failed"),
          }),
          { minLength: 1, maxLength: 40 },
        ),
        (cells) => {
          const e = setup();
          const changes = cells.map((c, x) => ({
            cell: { x, y: 64, z: 0 },
            before: blockStateOf(c.type, { direction: c.state }),
            after: blockStateOf(c.type, { direction: c.state + 1 }),
          }));
          for (const c of changes) e.world.put(c.cell, c.before);
          e.session.beginEdit();
          e.jobs.start(playerId, overworld, changes, "undoable");
          e.jobs.step();
          let restored = 0;
          let skipped = 0;
          const expected = changes.map((change, i) => {
            const c = cells[i];
            if (!c) throw new Error("Missing generated cell");
            const current =
              c.later === "reverted"
                ? change.before
                : c.later === "conflict"
                  ? blockStateOf(c.type, { direction: c.state + 2 })
                  : change.after;
            e.world.put(change.cell, current);
            const key = cellKey(change.cell);
            if (c.guard === "protected") e.world.protectedCells.add(key);
            if (c.guard === "unreadable") e.world.unreadableCells.add(key);
            if (c.guard === "failed") e.world.refusedCells.add(key);
            if (c.guard === "unreadable") {
              skipped++;
              return current;
            }
            if (c.later === "reverted") return current;
            if (c.later === "conflict" || c.guard !== "none") {
              skipped++;
              return current;
            }
            restored++;
            return change.before;
          });
          const writes = e.world.writes;
          e.undo.execute({ playerId });
          e.jobs.step();
          e.world.unreadableCells.clear();
          changes.forEach((c, i) => {
            expect(e.world.stateAt(overworld, c.cell)).toEqual(expected[i]);
          });
          expect(e.world.writes - writes).toBe(restored);
          expect(e.feedback.messages.at(-1)).toEqual(
            skipped > 0
              ? {
                  message: "undoDonePartial",
                  count: restored,
                  skippedCount: skipped,
                }
              : { message: "undoDone", count: restored },
          );
          expect(e.session.hasHistory).toBe(false);
        },
      ),
    );
  });

  it("silently leaves an already reverted cell even when protected", () => {
    const e = oneCell();
    e.world.put(cell, before);
    e.world.protectedCells.add(cellKey(cell));
    const writes = e.world.writes;
    e.undo.execute({ playerId });
    e.jobs.step();
    expect(e.world.writes).toBe(writes);
    expect(e.feedback.messages.at(-1)).toEqual({
      message: "undoDone",
      count: 0,
    });
  });

  it.each(["protected", "unreadable", "failed", "kept", "conflict"])(
    "counts a %s cell and consumes its history",
    (reason) => {
      const e = oneCell();
      if (reason === "protected") e.world.protectedCells.add(cellKey(cell));
      if (reason === "unreadable") e.world.unreadableCells.add(cellKey(cell));
      if (reason === "failed") e.world.refusedCells.add(cellKey(cell));
      if (reason === "kept") e.world.put(cell, blockStateOf("minecraft:chest"));
      if (reason === "conflict")
        e.world.put(cell, blockStateOf("minecraft:gold_block"));
      const writes = e.world.writes;
      e.undo.execute({ playerId });
      e.jobs.step();
      expect(e.world.writes).toBe(writes);
      expect(e.feedback.messages.at(-1)).toEqual({
        message: "undoDonePartial",
        count: 0,
        skippedCount: 1,
      });
      expect(e.session.hasHistory).toBe(false);
    },
  );

  it("keeps the original completion message when every cell is restored", () => {
    const e = oneCell();
    e.undo.execute({ playerId });
    e.jobs.step();
    expect(e.world.stateAt(overworld, cell)).toEqual(before);
    expect(e.feedback.messages.at(-1)).toEqual({
      message: "undoDone",
      count: 1,
    });
  });
});
