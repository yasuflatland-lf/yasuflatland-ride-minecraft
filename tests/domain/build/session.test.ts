import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import type { EditRecord } from "../../../src/domain/build/edit/change";
import type { BuildFlow } from "../../../src/domain/build/flow/flow";
import { beginRotateMode } from "../../../src/domain/build/flow/rotateMode";
import {
  EMPTY_HISTORY,
  takeLast,
  type UndoEntry,
  type UndoHistory,
  withEntry,
} from "../../../src/domain/build/history/history";
import {
  type BuildMode,
  MODE_OFF,
  type ModeInput,
  stepMode,
} from "../../../src/domain/build/mode";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import { BuildSession } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  type StructureHandle,
  structureHandle,
} from "../../../src/domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { undoRecord } from "../../support/undoRecord";

const dim = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone", {});

const recordAt = (x: number): EditRecord => ({
  dimensionId: dim,
  changes: [{ cell: { x, y: 0, z: 0 }, before: AIR, after: stone }],
});
const recordArb = fc.integer({ min: 1, max: 50 }).map(recordAt);
const cells = (record: EditRecord): UndoEntry => ({ kind: "cells", record });
const handleOf = (n: number) => `h${n}` as StructureHandle;
const snapshotAt = (n: number): UndoEntry => ({
  kind: "snapshot",
  snapshot: {
    dimensionId: dim,
    box: boxOf({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
    handle: handleOf(n),
  },
});
const run = (inputs: ModeInput[], from = MODE_OFF) =>
  inputs.reduce<BuildMode>(stepMode, from);

describe("undo history", () => {
  it("never exceeds depth and keeps the newest records in order", () => {
    fc.assert(
      fc.property(
        fc.array(recordArb, { maxLength: 40 }),
        fc.integer({ min: 1, max: 12 }),
        (records, depth) => {
          const h = records.reduce<UndoHistory>(
            (acc, r) => withEntry(acc, cells(r), depth).history,
            EMPTY_HISTORY,
          );
          expect(h.entries.length).toBeLessThanOrEqual(depth);
          expect(h.entries).toEqual(records.slice(-depth).map(cells));
        },
      ),
    );
  });

  it("takeLast returns the record just added", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 5 }), recordArb, (rs, r) => {
        const h = rs.reduce<UndoHistory>(
          (acc, x) => withEntry(acc, cells(x), 10).history,
          EMPTY_HISTORY,
        );
        const taken = takeLast(withEntry(h, cells(r), 10).history);
        expect(taken.entry).toEqual(cells(r));
        expect(taken.rest).toEqual(h);
      }),
    );
  });

  it("does not add an empty record", () => {
    const empty: EditRecord = { dimensionId: dim, changes: [] };
    expect(withEntry(EMPTY_HISTORY, cells(empty), 10).history).toBe(
      EMPTY_HISTORY,
    );
  });

  const stepsArb = fc.array(fc.boolean(), { maxLength: 40 }).map((kinds) =>
    kinds.map((snapshot, index) => ({
      entry: snapshot ? snapshotAt(index) : cells(recordAt(index)),
    })),
  );

  it("caps mixed history, reports every evicted snapshot once and takes newest first", () => {
    fc.assert(
      fc.property(stepsArb, fc.integer({ min: 0, max: 12 }), (steps, depth) => {
        let history = EMPTY_HISTORY;
        const dropped: StructureHandle[] = [];
        const pushed: UndoEntry[] = [];
        for (const { entry } of steps) {
          pushed.push(entry);
          const result = withEntry(history, entry, depth);
          history = result.history;
          dropped.push(...result.dropped);
          expect(history.entries).toEqual(
            pushed.slice(pushed.length - Math.min(pushed.length, depth)),
          );
          const evicted = pushed.slice(0, Math.max(0, pushed.length - depth));
          expect(dropped).toEqual(
            evicted.flatMap((e) =>
              e.kind === "snapshot" ? [e.snapshot.handle] : [],
            ),
          );
          expect(new Set(dropped).size).toBe(dropped.length);
          for (const e of history.entries)
            if (e.kind === "snapshot")
              expect(dropped).not.toContain(e.snapshot.handle);
        }
        const expected = [...history.entries].reverse();
        for (const entry of expected) {
          const result = takeLast(history);
          expect(result.entry).toBe(entry);
          history = result.rest;
        }
        expect(takeLast(history).entry).toBeUndefined();
      }),
    );
  });

  it("clearHistory returns only held snapshots and empties mixed history", () => {
    fc.assert(
      fc.property(stepsArb, (steps) => {
        const session = new BuildSession(asPlayerId("p1"));
        const expected = steps
          .slice(-BUILD_SPEC.undoDepth)
          .flatMap(({ entry }) =>
            entry.kind === "snapshot" ? [entry.snapshot.handle] : [],
          );
        for (const { entry } of steps) {
          if (entry.kind === "snapshot") {
            session.recordSnapshot(entry.snapshot);
          } else session.finishEdit(entry.record, "undoable");
        }
        expect(session.clearHistory()).toEqual(expected);
        expect(session.hasHistory).toBe(false);
        expect(session.takeUndo()).toBe("nothingToUndo");
        expect(session.clearHistory()).toEqual([]);
      }),
    );
  });

  it("session retains successive snapshots until the shared cap is exceeded", () => {
    const s = new BuildSession(asPlayerId("p1"));
    const first = snapshotAt(1);
    const second = snapshotAt(2);
    if (first.kind !== "snapshot" || second.kind !== "snapshot") return;
    expect(s.recordSnapshot(first.snapshot)).toEqual([]);
    expect(s.recordSnapshot(second.snapshot)).toEqual([]);
    expect(s.takeUndo()).toEqual(second);
    expect(s.takeUndo()).toEqual(first);
    expect(s.takeUndo()).toBe("nothingToUndo");
  });
});

describe("build mode", () => {
  it("does not turn on before modeEnterTicks of holding", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BUILD_SPEC.modeEnterTicks - 1 }),
        (n) => {
          const held = { holding: true };
          expect(run(Array(n).fill(held)).active).toBe(false);
          expect(run(Array(BUILD_SPEC.modeEnterTicks).fill(held)).active).toBe(
            true,
          );
        },
      ),
    );
  });

  it("stays on through a hotbar flick shorter than modeLeaveTicks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: BUILD_SPEC.modeLeaveTicks - 1 }),
        (flick) => {
          const on = run(
            Array(BUILD_SPEC.modeEnterTicks).fill({
              holding: true,
            }),
          );
          const after = run(
            [...Array(flick).fill({ holding: false }), { holding: true }],
            on,
          );
          expect(after.active).toBe(true);
        },
      ),
    );
  });

  it("turns off after modeLeaveTicks without holding", () => {
    const on = run(Array(BUILD_SPEC.modeEnterTicks).fill({ holding: true }));
    const off = run(
      Array(BUILD_SPEC.modeLeaveTicks).fill({ holding: false }),
      on,
    );
    expect(off.active).toBe(false);
  });
});

describe("BuildSession", () => {
  const session = () => new BuildSession(asPlayerId("p1"));

  it("takes the undo hint only once per session", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (calls) => {
        const s = session();
        expect(s.takeUndoHint()).toBe(true);
        for (let i = 0; i < calls; i++) expect(s.takeUndoHint()).toBe(false);
        expect(session().takeUndoHint()).toBe(true);
      }),
    );
  });

  it("refuses busy on a second beginEdit without finishEdit", () => {
    const s = session();
    expect(s.beginEdit()).toBeUndefined();
    expect(s.beginEdit()).toBe("busy");
    expect(undoRecord(s.takeUndo())).toBe("busy");
    s.finishEdit(recordAt(1), "undoable");
    expect(s.beginEdit()).toBeUndefined();
  });

  it.each(["undo", "irreversible"] as const)(
    "leaves the history unchanged when finishing an %s edit",
    (kind) => {
      const s = session();
      s.beginEdit();
      s.finishEdit(recordAt(1), "undoable");
      s.beginEdit();
      s.finishEdit(recordAt(2), kind);
      expect(s.isEditing).toBe(false);
      expect(undoRecord(s.takeUndo())).toEqual(recordAt(1));
      expect(undoRecord(s.takeUndo())).toBe("nothingToUndo");
    },
  );

  it("reports when build mode turns on", () => {
    const s = session();
    const input = { holding: true };
    const flips = Array.from({ length: BUILD_SPEC.modeEnterTicks }, () =>
      s.tickMode(input),
    );
    expect(flips.filter(Boolean)).toHaveLength(1);
    expect(s.isInBuildMode).toBe(true);
  });
});

const coordinate = fc.integer({ min: -10, max: 10 });
const cellArb = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const boxArb = fc.tuple(cellArb, cellArb).map(([a, b]) => boxOf(a, b));
const dimensionArb = fc.string().map(asDimensionId);
const clipboardArb = boxArb.map((box) => structureClipboard(box, () => stone));
const flowArb: fc.Arbitrary<BuildFlow> = fc.oneof(
  fc.constant({ kind: "idle" } as const),
  fc.record({
    kind: fc.constant("point1" as const),
    dimensionId: dimensionArb,
    cell: cellArb,
    material: fc.constant(stone),
  }),
  fc.record({
    kind: fc.constant("endpoint" as const),
    dimensionId: dimensionArb,
    from: cellArb,
    to: cellArb,
    material: fc.constant(stone),
  }),
  fc.record({
    kind: fc.constant("heightStep" as const),
    dimensionId: dimensionArb,
    base: boxArb,
    from: cellArb,
    heightedKind: fc.constantFrom(
      "copy" as const,
      "cube" as const,
      "cylinder" as const,
      "sphere" as const,
      "gable" as const,
      "hip" as const,
    ),
    previous: fc.integer({ min: 1, max: 100 }),
    heightLocked: fc.boolean(),
    material: fc.constant(stone),
  }),
  fc.record({
    kind: fc.constant("pasteAim" as const),
    turn: fc.constant(0 as const),
    lastPaste: fc.option(fc.record({ anchor: cellArb, tick: fc.nat() }), {
      nil: undefined,
    }),
  }),
);

it("completeCopy replaces the clipboard and box and enters paste aiming from any flow without changing history", () => {
  fc.assert(
    fc.property(
      flowArb,
      dimensionArb,
      boxArb,
      clipboardArb,
      fc.array(recordArb, { maxLength: BUILD_SPEC.undoDepth }),
      (flow, dimensionId, box, clipboard, records) => {
        const session = new BuildSession(asPlayerId("p1"));
        session.confirmBox(
          dim,
          boxOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        );
        holdClipboard(
          session,
          structureClipboard(box, () => AIR),
        );
        session.setFlow(flow);
        for (const record of records) session.finishEdit(record, "undoable");
        session.completeCopy(dimensionId, box, clipboard);
        expect(session.flow).toEqual({ kind: "pasteAim", turn: 0 });
        expect(session.clipboard).toBe(clipboard);
        expect(session.confirmedBox).toEqual({ dimensionId, box });
        for (const record of [...records].reverse())
          expect(undoRecord(session.takeUndo())).toBe(record);
        expect(undoRecord(session.takeUndo())).toBe("nothingToUndo");
      },
    ),
  );
});

it("leaveBuildMode discards the clipboard in every flow and is idempotent", () => {
  fc.assert(
    fc.property(
      flowArb,
      dimensionArb,
      fc.option(boxArb, { nil: undefined }),
      fc.option(clipboardArb, { nil: undefined }),
      (flow, dimensionId, box, clipboard) => {
        const session = new BuildSession(asPlayerId("p1"));
        if (box) session.confirmBox(dimensionId, box);
        if (clipboard) holdClipboard(session, clipboard);
        const confirmed = session.confirmedBox;
        session.setFlow(flow);
        session.leaveBuildMode();
        expect(session.flow).toEqual({ kind: "idle" });
        expect(session.clipboard).toBeUndefined();
        expect(session.confirmedBox).toBe(
          clipboard || flow.kind !== "idle" ? undefined : confirmed,
        );
        const idle = session.flow;
        session.leaveBuildMode();
        expect(session.flow).toBe(idle);
      },
    ),
  );
});

it("endPasting clears every flow, clipboard and confirmed box without changing history", () => {
  fc.assert(
    fc.property(
      flowArb,
      dimensionArb,
      fc.option(boxArb, { nil: undefined }),
      fc.option(clipboardArb, { nil: undefined }),
      recordArb,
      (flow, dimensionId, box, clipboard, record) => {
        const session = new BuildSession(asPlayerId("p1"));
        if (box) session.confirmBox(dimensionId, box);
        if (clipboard) holdClipboard(session, clipboard);
        session.setFlow(flow);
        session.finishEdit(record, "undoable");
        session.endPasting();
        expect(session.flow).toEqual({ kind: "idle" });
        expect(session.clipboard).toBeUndefined();
        expect(session.confirmedBox).toBeUndefined();
        expect(undoRecord(session.takeUndo())).toBe(record);
      },
    ),
  );
});

it("startNewCopy idles any paste aiming, clears the box and repeat window, and keeps the clipboard and history", () => {
  fc.assert(
    fc.property(
      clipboardArb,
      boxArb,
      cellArb,
      fc.nat(),
      recordArb,
      (clipboard, box, anchor, tick, record) => {
        const session = new BuildSession(asPlayerId("p1"));
        session.completeCopy(dim, box, clipboard);
        session.finishEdit(record, "undoable");
        session.setFlow({
          kind: "pasteAim",
          turn: 0,
          lastPaste: { anchor, tick },
        });
        session.startNewCopy();
        expect(session.flow).toEqual({ kind: "idle" });
        expect(session.confirmedBox).toBeUndefined();
        expect(session.clipboard).toBe(clipboard);
        expect(undoRecord(session.takeUndo())).toBe(record);
        session.leaveBuildMode();
        expect(session.flow).toEqual({ kind: "idle" });
        expect(session.clipboard).toBeUndefined();
      },
    ),
  );
});

it("returns only replaced or cleared structure handles and retains identical handles", () => {
  fc.assert(
    fc.property(
      fc.uuid(),
      fc.uuid(),
      fc.constantFrom("clearClipboard", "endPasting", "leaveBuildMode"),
      (first, second, exit) => {
        const session = new BuildSession(asPlayerId("builder"));
        const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
        const clipboard = (raw: string) => ({
          size: { x: 1, y: 1, z: 1 },
          blockCount: 1,
          contents: {
            kind: "structure" as const,
            handle: structureHandle(raw),
          },
        });
        const a = clipboard(first);
        const b = clipboard(second);
        expect(session.completeCopy(dim, box, a)).toBeUndefined();
        expect(
          session.completeCopy(dim, box, clipboard(first)),
        ).toBeUndefined();
        expect(session.completeCopy(dim, box, b)).toBe(
          first === second ? undefined : a.contents.handle,
        );
        expect(session[exit]()).toBe(b.contents.handle);
        expect(session[exit]()).toBeUndefined();
        const next = structureClipboard(box, () => stone);
        expect(session.completeCopy(dim, box, next)).toBeUndefined();
        expect(session[exit]()).toBe(next.contents.handle);
        expect(session[exit]()).toBeUndefined();
      },
    ),
  );
});

it("replaceSelection preserves the flow state and replaces frozen endpoint corners and same-dimension confirmation", () => {
  fc.assert(
    fc.property(
      flowArb,
      boxArb,
      dimensionArb,
      fc.boolean(),
      (flow, box, confirmedDimension, confirmed) => {
        const session = new BuildSession(asPlayerId("p1"));
        if (confirmed)
          session.confirmBox(
            confirmedDimension,
            boxOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
          );
        const previous = session.confirmedBox;
        session.setFlow(flow);
        session.replaceSelection(box);
        expect(session.flow.kind).toBe(flow.kind);
        if (flow.kind === "endpoint") {
          expect(session.flow).toEqual({ ...flow, from: box.min, to: box.max });
          if (session.flow.kind !== "endpoint")
            throw new Error("Missing endpoint flow");
          expect(session.flow.from).not.toBe(box.min);
          expect(session.flow.to).not.toBe(box.max);
          expect(Object.isFrozen(session.flow.from)).toBe(true);
          expect(Object.isFrozen(session.flow.to)).toBe(true);
        } else expect(session.flow).toBe(flow);
        if (
          flow.kind === "endpoint" &&
          previous?.dimensionId === flow.dimensionId
        )
          expect(session.confirmedBox).toEqual({
            dimensionId: flow.dimensionId,
            box,
          });
        else expect(session.confirmedBox).toBe(previous);
      },
    ),
  );
});

it("replaceSelection updates an existing confirmation in the endpoint dimension", () => {
  fc.assert(
    fc.property(boxArb, boxArb, dimensionArb, (before, after, dimensionId) => {
      const session = new BuildSession(asPlayerId("p1"));
      session.confirmBox(dimensionId, before);
      session.setFlow({
        kind: "endpoint",
        dimensionId,
        from: before.max,
        to: before.min,
        material: stone,
      });
      session.replaceSelection(after);
      expect(session.flow).toEqual({
        kind: "endpoint",
        dimensionId,
        from: after.min,
        to: after.max,
        material: stone,
      });
      expect(session.confirmedBox).toEqual({ dimensionId, box: after });
      expect(session.confirmedBox?.box).not.toBe(after);
    }),
  );
});

it("advances rotation selections and only updates confirmed boxes in the same dimension", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -50, max: 50 }),
      fc.boolean(),
      (x, sameDimension) => {
        const session = new BuildSession(asPlayerId("alex"));
        const box = boxOf({ x, y: 0, z: 0 }, { x: x + 4, y: 2, z: 1 });
        const confirmedDimension = sameDimension
          ? dim
          : asDimensionId("nether");
        session.confirmBox(confirmedDimension, box);
        session.setFlow(beginRotateMode(dim, box, stone, 1));
        const target = planRotationAboutCenter(box).target;
        session.replaceSelection(target);
        expect(session.flow).toEqual({
          kind: "rotateMode",
          dimensionId: dim,
          box: target,
          turn: 2,
          material: stone,
        });
        expect(session.confirmedBox).toEqual({
          dimensionId: confirmedDimension,
          box: sameDimension ? target : box,
        });
      },
    ),
  );
});

it.each(["endPasting", "leaveBuildMode", "clearSelection"] as const)(
  "%s exits rotation while retaining history",
  (exit) => {
    fc.assert(
      fc.property(recordArb, (record) => {
        const session = new BuildSession(asPlayerId("alex"));
        const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 1 });
        session.confirmBox(dim, box);
        session.setFlow(beginRotateMode(dim, box, stone, 1));
        session.finishEdit(record, "undoable");
        session[exit]();
        expect(session.flow).toEqual({ kind: "idle" });
        expect(session.confirmedBox).toBeUndefined();
        expect(session.takeUndo()).toEqual(cells(record));
      }),
    );
  },
);
