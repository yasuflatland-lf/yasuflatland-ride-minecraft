import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import type {
  EditKind,
  PlannedChange,
} from "../../../src/domain/build/edit/change";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { undoRecord } from "../../support/undoRecord";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";

const alex = asPlayerId("alex");
const blake = asPlayerId("blake");
const stone = blockStateOf("minecraft:stone");

function plan(length: number, z = 0): PlannedChange[] {
  return Array.from({ length }, (_, x) => ({
    cell: { x, y: 64, z },
    after: stone,
  }));
}

function setup() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const log = { warn: vi.fn<(message: string) => void>() };
  const jobs = new EditJobs(repo, world, feedback, log, new FakeBuildPlayers());
  function start(
    player: PlayerId,
    changes: PlannedChange[],
    kind: EditKind = "undoable",
  ) {
    const session = repo.getOrCreate(player);
    expect(session.beginEdit()).toBeUndefined();
    jobs.start(player, overworld, changes, kind);
    return session;
  }
  return { repo, world, feedback, log, jobs, start };
}

describe("EditJobs failure isolation", () => {
  it.each(["undo", "irreversible"] as const)(
    "counts changed cells without retaining per-cell records for %s",
    (kind) => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (length) => {
          const e = setup();
          const session = e.start(alex, plan(length), kind);
          const finish = vi.spyOn(session, "finishEdit");
          e.jobs.step();
          expect(e.world.writes).toBe(length);
          expect(finish).toHaveBeenCalledExactlyOnceWith(
            { dimensionId: overworld, changes: [] },
            kind,
          );
          expect(session.hasHistory).toBe(false);
          expect(session.isEditing).toBe(false);
          expect(e.feedback.messages).toEqual([
            {
              message: kind === "undo" ? "undoDone" : "editDoneCount",
              count: length,
            },
          ]);
        }),
      );
    },
  );

  it("preserves earlier history and the unused hint after an irreversible edit", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 20 }),
        (hasHistory, length) => {
          const e = setup();
          const session = e.repo.getOrCreate(alex);
          const earlier = {
            dimensionId: overworld,
            changes: [
              { cell: { x: 0, y: 60, z: 0 }, before: AIR, after: stone },
            ],
          };
          if (hasHistory) session.finishEdit(earlier, "undoable");
          e.start(alex, plan(length), "irreversible");
          e.jobs.step();
          expect(session.isEditing).toBe(false);
          expect(e.feedback.messages).toEqual([
            { message: "editDoneCount", count: length },
          ]);
          expect(e.feedback.undoHints).toEqual([]);
          expect(undoRecord(session.takeUndo())).toEqual(
            hasHistory ? earlier : "nothingToUndo",
          );
          expect(undoRecord(session.takeUndo())).toBe("nothingToUndo");
          e.start(alex, plan(1, 1));
          e.jobs.step();
          expect(e.feedback.undoHints).toEqual([alex]);
        },
      ),
    );
  });

  it("commits once when completion feedback always throws", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 2, max: 50 }),
        fc.constantFrom("showMessage", "showUndoHint"),
        (length, ticks, method) => {
          const e = setup();
          const feedback = vi
            .spyOn(e.feedback, method)
            .mockImplementation(() => {
              throw new Error("feedback unavailable");
            });
          const session = e.start(alex, plan(length));
          const finish = vi.spyOn(session, "finishEdit");
          for (let tick = 0; tick < ticks; tick++) e.jobs.step();
          expect(session.isEditing).toBe(false);
          expect(finish).toHaveBeenCalledTimes(1);
          expect(feedback).toHaveBeenCalledTimes(1);
          expect(e.world.writes).toBe(length);
          expect(undoRecord(session.takeUndo())).toEqual({
            dimensionId: overworld,
            changes: plan(length).map((change) => ({ ...change, before: AIR })),
          });
          expect(undoRecord(session.takeUndo())).toBe("nothingToUndo");
          expect(e.log.warn).toHaveBeenCalledExactlyOnceWith(
            `build edit feedback for ${alex} failed: Error: feedback unavailable`,
          );
        },
      ),
    );
  });

  it("completes another builder when the first builder's message throws", () => {
    const e = setup();
    const show = e.feedback.showMessage.bind(e.feedback);
    const messages = vi
      .spyOn(e.feedback, "showMessage")
      .mockImplementation((player, ...args) => {
        if (player === alex) throw new Error("feedback unavailable");
        show(player, ...args);
      });
    const a = e.start(alex, plan(1));
    const b = e.start(blake, plan(1, 1));
    e.jobs.step();
    expect(a.isEditing).toBe(false);
    expect(b.isEditing).toBe(false);
    expect(a.hasHistory).toBe(true);
    expect(b.hasHistory).toBe(true);
    expect(messages).toHaveBeenCalledWith(blake, "editDone", 1);
    expect(e.feedback.messages).toEqual([{ message: "editDone", count: 1 }]);
    expect(e.feedback.undoHints).toEqual([blake]);
  });

  it.each(["setState", "stateAt"] as const)(
    "commits partial changes after %s throws and preserves the other job's budget",
    (method) => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 20 }), (applied) => {
          const e = setup();
          const setState = e.world.setState.bind(e.world);
          const stateAt = e.world.stateAt.bind(e.world);
          const writes = vi
            .spyOn(e.world, "setState")
            .mockImplementation((dimension, cell, state) => {
              if (method === "setState" && cell.z === 0 && cell.x === applied)
                throw new Error("world unavailable");
              return setState(dimension, cell, state);
            });
          const reads = vi
            .spyOn(e.world, "stateAt")
            .mockImplementation((dimension, cell) => {
              if (method === "stateAt" && cell.z === 0 && cell.x === applied)
                throw new Error("world unavailable");
              return stateAt(dimension, cell);
            });
          const failing = method === "setState" ? writes : reads;
          const changes = plan(applied + 2);
          const a = e.start(alex, changes);
          const b = e.start(blake, plan(BUILD_SPEC.blocksPerTick + 1, 1));
          e.jobs.step();
          expect(a.isEditing).toBe(false);
          expect(undoRecord(a.takeUndo())).toEqual({
            dimensionId: overworld,
            changes: changes.slice(0, applied).map((change) => ({
              ...change,
              before: AIR,
            })),
          });
          expect(undoRecord(a.takeUndo())).toBe("nothingToUndo");
          expect(b.isEditing).toBe(true);
          expect(e.world.writes).toBe(applied + BUILD_SPEC.blocksPerTick);
          expect(e.log.warn).toHaveBeenCalledExactlyOnceWith(
            `build edit job for ${alex} failed: Error: world unavailable`,
          );
          const calls = failing.mock.calls.filter(
            ([, cell]) => cell.z === 0,
          ).length;
          e.jobs.step();
          e.jobs.step();
          expect(b.isEditing).toBe(false);
          expect(e.world.writes).toBe(applied + BUILD_SPEC.blocksPerTick + 1);
          expect(
            failing.mock.calls.filter(([, cell]) => cell.z === 0),
          ).toHaveLength(calls);
          expect(e.feedback.messages).toEqual([
            { message: "editDone", count: BUILD_SPEC.blocksPerTick + 1 },
          ]);
        }),
      );
    },
  );

  it("drops a failed job even when committing its partial history throws", () => {
    const e = setup();
    vi.spyOn(e.world, "setState").mockImplementation(() => {
      throw new Error("world unavailable");
    });
    const a = e.start(alex, plan(1));
    const finish = vi.spyOn(a, "finishEdit").mockImplementation(() => {
      throw new Error("history unavailable");
    });
    const b = e.start(blake, []);
    for (let tick = 0; tick < 10; tick++) e.jobs.step();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(b.isEditing).toBe(false);
    expect(e.log.warn.mock.calls).toEqual([
      [`build edit job for ${alex} failed: Error: world unavailable`],
      [`build edit history for ${alex} failed: Error: history unavailable`],
    ]);
  });

  it("does not retry a completion commit that throws after recording history", () => {
    const e = setup();
    const a = e.start(alex, plan(1));
    const original = a.finishEdit.bind(a);
    const finish = vi.spyOn(a, "finishEdit").mockImplementation((...args) => {
      original(...args);
      throw new Error("history unavailable");
    });
    const b = e.start(blake, plan(1, 1));
    for (let tick = 0; tick < 10; tick++) e.jobs.step();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(a.isEditing).toBe(false);
    expect(b.isEditing).toBe(false);
    expect(undoRecord(a.takeUndo())).toMatchObject({
      changes: [{ before: AIR, after: stone }],
    });
    expect(undoRecord(a.takeUndo())).toBe("nothingToUndo");
    expect(e.log.warn).toHaveBeenCalledExactlyOnceWith(
      `build edit job for ${alex} failed: Error: history unavailable`,
    );
  });
});
