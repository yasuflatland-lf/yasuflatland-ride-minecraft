import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import type { EditRecord } from "../../../src/domain/build/edit/change";
import type { BuildFlow } from "../../../src/domain/build/flow/flow";
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
import { BuildSession } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { StructureHandle } from "../../../src/domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { holdClipboard } from "../../support/buildClipboard";
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

  // Each step adds a cell record (n = record x) or a snapshot (n = handle id).
  const stepsArb = fc.array(
    fc.oneof(
      recordArb.map((r) => ({ snapshot: false as const, entry: cells(r) })),
      fc
        .integer({ min: 0, max: 1000 })
        .map((n) => ({ snapshot: true as const, entry: snapshotAt(n) })),
    ),
    { maxLength: 40 },
  );

  it("keeps at most one snapshot and at most depth cell entries", () => {
    fc.assert(
      fc.property(stepsArb, fc.integer({ min: 0, max: 12 }), (steps, depth) => {
        const h = steps.reduce<UndoHistory>(
          (acc, s) => withEntry(acc, s.entry, depth).history,
          EMPTY_HISTORY,
        );
        const snapshots = h.entries.filter((e) => e.kind === "snapshot");
        expect(snapshots.length).toBeLessThanOrEqual(1);
        expect(h.entries.length - snapshots.length).toBeLessThanOrEqual(depth);
      }),
    );
  });

  it("keeps the newest entries in the order they were added", () => {
    fc.assert(
      fc.property(stepsArb, (steps) => {
        const h = steps.reduce<UndoHistory>(
          (acc, s) => withEntry(acc, s.entry, 100).history,
          EMPTY_HISTORY,
        );
        const lastSnapshot = steps.map((s) => s.snapshot).lastIndexOf(true);
        const expected = steps
          .filter((s, i) => !s.snapshot || i === lastSnapshot)
          .map((s) => s.entry);
        expect(h.entries).toEqual(expected);
      }),
    );
  });

  it("reports exactly the removed snapshot handles as dropped", () => {
    fc.assert(
      fc.property(stepsArb, (steps) => {
        let h = EMPTY_HISTORY;
        for (const s of steps) {
          const before = h.entries.flatMap((e) =>
            e.kind === "snapshot" ? [e.snapshot.handle] : [],
          );
          const r = withEntry(h, s.entry, 10);
          expect(r.dropped).toEqual(s.snapshot ? before : []);
          h = r.history;
        }
      }),
    );
  });

  it("session.recordSnapshot returns the replaced handle", () => {
    const s = new BuildSession(asPlayerId("p1"));
    const first = snapshotAt(1);
    const second = snapshotAt(2);
    if (first.kind !== "snapshot" || second.kind !== "snapshot") return;
    expect(s.recordSnapshot(first.snapshot)).toEqual([]);
    expect(s.recordSnapshot(second.snapshot)).toEqual([first.snapshot.handle]);
    expect(s.takeUndo()).toEqual(second);
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
const clipboardArb = boxArb.map((box) => clipboardOf(box, () => stone));
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
    skipAir: fc.boolean(),
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
          clipboardOf(box, () => AIR),
        );
        session.setFlow(flow);
        for (const record of records) session.finishEdit(record, "undoable");
        session.completeCopy(dimensionId, box, clipboard);
        expect(session.flow).toEqual({ kind: "pasteAim", skipAir: false });
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
      fc.boolean(),
      cellArb,
      fc.nat(),
      recordArb,
      (clipboard, box, skipAir, anchor, tick, record) => {
        const session = new BuildSession(asPlayerId("p1"));
        session.completeCopy(dim, box, clipboard);
        session.finishEdit(record, "undoable");
        session.setFlow({
          kind: "pasteAim",
          skipAir,
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
