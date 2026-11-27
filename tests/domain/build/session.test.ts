import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, boxWithHeight } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import type { EditRecord } from "../../../src/domain/build/edit/change";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import { cornerTaps } from "../../../src/domain/build/flow/taps";
import {
  EMPTY_HISTORY,
  takeLast,
  type UndoEntry,
  type UndoHistory,
  withEntry,
} from "../../../src/domain/build/history/history";
import { NO_TURN } from "../../../src/domain/build/rotation/quarterTurn";
import { planRotationAboutCenter } from "../../../src/domain/build/rotation/rotateBox";
import {
  selectionHeightLimit,
  selectionOf,
} from "../../../src/domain/build/selection";
import { BuildSession } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  type StructureHandle,
  structureHandle,
} from "../../../src/domain/build/structure/handle";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { OVERWORLD_RANGE } from "../../helpers/buildHeightRange";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import {
  chooseHeightedFlow,
  selectionFlows,
  tappedSelection,
} from "../../support/buildSelection";
import { undoRecord } from "../../support/undoRecord";

const dim = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone", {});

const recordAt = (x: number): EditRecord => ({
  dimensionId: dim,
  changes: [{ cell: cellOf({ x, y: 0, z: 0 }), before: AIR, after: stone }],
});
const recordArb = fc.integer({ min: 1, max: 50 }).map(recordAt);
const cells = (record: EditRecord): UndoEntry => ({ kind: "cells", record });
const handleOf = (n: number) => `h${n}` as StructureHandle;
const snapshotAt = (n: number): UndoEntry => ({
  kind: "snapshot",
  snapshot: {
    dimensionId: dim,
    box: boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 1, y: 1, z: 1 })),
    handle: handleOf(n),
  },
});

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
    const empty: EditRecord = {
      dimensionId: dim,
      changes: [],
      selectionBeforeTaps: cornerTaps(
        boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 1, y: 0, z: 1 })),
      ),
    };
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

  it("clearHistory releases held snapshots and empties mixed history", () => {
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
        session.drainReleased();
        session.clearHistory();
        expect(session.drainReleased()).toEqual(expected);
        expect(session.hasHistory).toBe(false);
        expect(session.takeUndo()).toBe("nothingToUndo");
        session.clearHistory();
        expect(session.drainReleased()).toEqual([]);
      }),
    );
  });

  it("session retains successive snapshots until the shared cap is exceeded", () => {
    const s = new BuildSession(asPlayerId("p1"));
    const first = snapshotAt(1);
    const second = snapshotAt(2);
    if (first.kind !== "snapshot" || second.kind !== "snapshot") return;
    s.recordSnapshot(first.snapshot);
    s.recordSnapshot(second.snapshot);
    expect(s.drainReleased()).toEqual([]);
    expect(s.takeUndo()).toEqual(second);
    expect(s.takeUndo()).toEqual(first);
    expect(s.takeUndo()).toBe("nothingToUndo");
  });
});

describe("build mode", () => {
  it("enters and leaves build mode after consecutive inputs and reports each transition once", () => {
    const { modeEnterTicks, modeLeaveTicks } = BUILD_SPEC;
    const runLength = fc.integer({
      min: 1,
      max: 2 * Math.max(modeEnterTicks, modeLeaveTicks),
    });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.boolean(), runLength), {
          minLength: 1,
          maxLength: 20,
        }),
        (runs) => {
          const inputs = runs.flatMap(([holding, length]) =>
            Array<boolean>(length).fill(holding),
          );
          const session = new BuildSession(asPlayerId("p1"));
          let active = false;
          for (const [tick, holding] of inputs.entries()) {
            const before = active;
            const threshold = active ? modeLeaveTicks : modeEnterTicks;
            const recent = inputs.slice(
              Math.max(0, tick + 1 - threshold),
              tick + 1,
            );
            if (
              holding !== active &&
              recent.length === threshold &&
              recent.every((input) => input === holding)
            )
              active = holding;
            expect(session.tickMode({ holding })).toBe(before !== active);
            expect(session.isInBuildMode).toBe(active);
          }
        },
      ),
      {
        examples: [
          [
            [
              [true, modeEnterTicks],
              [false, modeLeaveTicks],
              [true, modeEnterTicks],
            ],
          ],
        ],
      },
    );
  });
});

it("activates build mode when a wand tap fixes an endpoint", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 20 }),
      fc.boolean(),
      (length, line) => {
        const session = new BuildSession(asPlayerId("builder"));
        const from = cellOf({ x: 0, y: 60, z: 0 });
        const to = cellOf({ ...from, x: length, z: line ? 0 : length });
        session.tapBlock(dim, from, stone, OVERWORLD_RANGE);
        expect(session.isInBuildMode).toBe(false);
        session.tapAir(to, OVERWORLD_RANGE);
        expect(session.isInBuildMode).toBe(true);
        expect(session.flow.kind).toBe(line ? "selected" : "baseHeight");
        expect(session.confirmLiveHeight()).toBe(!line);
        expect(session.flow.kind).toBe("selected");
      },
    ),
  );
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
});

const coordinate = fc.integer({ min: -10, max: 10 });
const cellArb = fc
  .record({ x: coordinate, y: coordinate, z: coordinate })
  .map(cellOf);
const boxArb = fc.tuple(cellArb, cellArb).map(([a, b]) => boxOf(a, b));
const dimensionArb = fc.string().map(asDimensionId);
const clipboardArb = boxArb.map((box) => structureClipboard(box, () => stone));
const flowArb: fc.Arbitrary<BuildFlow> = fc.oneof(
  fc.constant({ kind: "idle" } as const),
  fc.record({
    kind: fc.constant("point1" as const),
    start: fc.record({
      dimensionId: dimensionArb,
      cell: cellArb,
      material: fc.constant(stone),
    }),
  }),
  fc
    .record({
      kind: fc.constant("selected" as const),
      menuLevel: fc.constantFrom("root" as const, "build" as const),
      dimensionId: dimensionArb,
      from: cellArb,
      to: cellArb,
    })
    .map(({ dimensionId, from, to, ...flow }) => ({
      ...flow,
      ...tappedSelection(
        selectionOf(dimensionId, boxOf(from, to), stone),
        from,
        to,
      ),
    })),
  boxArb.map((box) => ({
    kind: "baseHeight" as const,
    ...tappedSelection(selectionOf(dim, box, stone), box.min, box.max),
    baseBox: boxWithHeight(box, 1),
    liveHeight: 5,
  })),
  fc
    .record({
      kind: fc.constant("heightStep" as const),
      dimensionId: dimensionArb,
      base: boxArb,
      from: cellArb,
      to: cellArb,
      heightedKind: fc.constantFrom(
        "cube" as const,
        "cylinder" as const,
        "sphere" as const,
        "gable" as const,
        "hip" as const,
      ),
      liveHeight: fc.integer({ min: 1, max: 100 }),
      heightLocked: fc.boolean(),
    })
    .map(({ dimensionId, from, to, ...flow }) => ({
      ...flow,
      start: { dimensionId, cell: from, material: stone },
      taps: { from, to },
    })),
  fc.record({
    kind: fc.constant("pasteAim" as const),
    manualTurn: fc.constant(0 as const),
  }),
);

it("resumes only idle and selected clipboards at the copied facing", () => {
  fc.assert(
    fc.property(cellArb, dimensionArb, (from, dimensionId) => {
      const { selected, inProgress } = selectionFlows(from, dimensionId, stone);
      const flows: BuildFlow[] = [
        { kind: "idle" },
        selected,
        ...inProgress,
        { kind: "pasteAim", manualTurn: 3, facing: "west" },
      ];
      const selection = selectionOf(dimensionId, boxOf(from, from), stone);
      const clipboard = structureClipboard(selection.box);
      for (const held of [false, true]) {
        for (const flow of flows) {
          const session = new BuildSession(asPlayerId("builder"));
          session.confirmBox(selection);
          if (held) holdClipboard(session, clipboard);
          session.setFlowForTest(flow);
          const allowed =
            held && (flow.kind === "idle" || flow.kind === "selected");
          expect(session.resumePasteAim()).toBe(allowed);
          if (allowed)
            expect(session.flow).toEqual({
              kind: "pasteAim",
              manualTurn: NO_TURN,
            });
          else expect(session.flow).toBe(flow);
          expect(session.confirmedBox).toBe(selection);
          expect(session.clipboard).toBe(held ? clipboard : undefined);
        }
      }
    }),
  );
});

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
          selectionOf(
            dim,
            boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 0, y: 0, z: 0 })),
            stone,
          ),
        );
        holdClipboard(
          session,
          structureClipboard(box, () => AIR),
        );
        session.setFlowForTest(flow);
        for (const record of records) session.finishEdit(record, "undoable");
        session.completeCopy(selectionOf(dimensionId, box, stone), clipboard);
        expect(session.flow).toEqual({ kind: "pasteAim", manualTurn: 0 });
        expect(session.clipboard).toBe(clipboard);
        expect(session.confirmedBox).toEqual({
          material: stone,
          dimensionId,
          box,
        });
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
        if (box) session.confirmBox(selectionOf(dimensionId, box, stone));
        if (clipboard) holdClipboard(session, clipboard);
        const confirmed = session.confirmedBox;
        session.setFlowForTest(flow);
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
        if (box) session.confirmBox(selectionOf(dimensionId, box, stone));
        if (clipboard) holdClipboard(session, clipboard);
        session.setFlowForTest(flow);
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

it("startNewCopy idles any paste aiming, clears the box, and keeps the clipboard and history", () => {
  fc.assert(
    fc.property(clipboardArb, boxArb, recordArb, (clipboard, box, record) => {
      const session = new BuildSession(asPlayerId("p1"));
      session.completeCopy(selectionOf(dim, box, stone), clipboard);
      session.finishEdit(record, "undoable");
      session.setFlowForTest({
        kind: "pasteAim",
        manualTurn: 1,
        facing: "north",
      });
      session.startNewCopy();
      expect(session.flow).toEqual({ kind: "idle" });
      expect(session.confirmedBox).toBeUndefined();
      expect(session.clipboard).toBe(clipboard);
      expect(undoRecord(session.takeUndo())).toBe(record);
      session.leaveBuildMode();
      expect(session.flow).toEqual({ kind: "idle" });
      expect(session.clipboard).toBeUndefined();
    }),
  );
});

it("releases only replaced or cleared structure handles and retains identical handles", () => {
  fc.assert(
    fc.property(
      fc.uuid(),
      fc.uuid(),
      fc.constantFrom("clearClipboard", "endPasting", "leaveBuildMode"),
      (first, second, exit) => {
        const session = new BuildSession(asPlayerId("builder"));
        const box = boxOf(
          cellOf({ x: 0, y: 0, z: 0 }),
          cellOf({ x: 0, y: 0, z: 0 }),
        );
        const selection = selectionOf(dim, box, stone);
        const clipboard = (raw: string) =>
          clipboardOf({
            selection,
            facing: "east",
            handle: structureHandle(raw),
          });
        const a = clipboard(first);
        const b = clipboard(second);
        session.completeCopy(selection, a);
        session.clearClipboard();
        session.completeCopy(selection, clipboard(first));
        expect(session.drainReleased()).toEqual([]);
        session.completeCopy(selection, b);
        expect(session.drainReleased()).toEqual(
          first === second ? [] : [a.contents.handle],
        );
        session[exit]();
        expect(session.drainReleased()).toEqual([b.contents.handle]);
        session[exit]();
        expect(session.drainReleased()).toEqual([]);
        const next = structureClipboard(box, () => stone);
        session.completeCopy(selection, next);
        session[exit]();
        session[exit]();
        expect(session.drainReleased()).toEqual([next.contents.handle]);
      },
    ),
  );
});

it("confirms a box as an active root selection with matching Copy bounds", () => {
  fc.assert(
    fc.property(boxArb, dimensionArb, (box, dimensionId) => {
      const session = new BuildSession(asPlayerId("p1"));
      const selection = selectionOf(dimensionId, box, stone);
      session.confirmBox(selection, "selected", cornerTaps(selection.box));
      expect(session.flow).toEqual({
        kind: "selected",
        menuLevel: "root",
        rootShown: true,
        ...tappedSelection(selection, box.min, box.max),
      });
      expect(session.confirmedBox).toBe(selection);
      expect(session.isInBuildMode).toBe(true);
    }),
  );
});

it("uses the supplied taps even when replacing a selected box, and defaults to idle", () => {
  fc.assert(
    fc.property(cellArb, cellArb, (from, to) => {
      const box = boxOf(from, to);
      const session = new BuildSession(asPlayerId("p1"));
      const selection = selectionOf(dim, box, stone);
      session.setFlowForTest({
        kind: "selected",
        menuLevel: "build",
        ...tappedSelection(selection, box.min, box.max),
      });
      session.confirmBox(selection, "selected", { from, to });
      expect(session.flow).toEqual({
        kind: "selected",
        menuLevel: "root",
        rootShown: true,
        ...tappedSelection(selection, from, to),
      });
      session.confirmBox(selection);
      expect(session.flow).toEqual({ kind: "idle" });
      expect(session.confirmedBox).toBe(selection);
    }),
  );
});

it("confirming a box from a selection or terrain confirmation keeps the tapped points", () => {
  fc.assert(
    fc.property(
      cellArb,
      cellArb,
      fc.integer({ min: 1, max: 10 }),
      fc.constantFrom("selected" as const, "terrainConfirm" as const),
      (from, to, height, kind) => {
        const session = new BuildSession(asPlayerId("p1"));
        const selection = selectionOf(dim, boxOf(from, to), stone);
        const fixed = tappedSelection(selection, from, to);
        const flow =
          kind === "selected"
            ? { kind, menuLevel: "build" as const, ...fixed }
            : { kind, op: "fillBelow" as const, ...fixed };
        session.setFlowForTest(flow);
        const next = selectionOf(
          dim,
          boxWithHeight(selection.box, height),
          stone,
        );
        session.confirmBox(next, "selected", flow.taps);
        expect(session.flow).toEqual({
          kind: "selected",
          menuLevel: "root",
          rootShown: true,
          ...tappedSelection(next, from, to),
        });
      },
    ),
  );
});

it("replaces taps and bounds together only while selected or aiming height", () => {
  fc.assert(
    fc.property(flowArb, boxArb, (flow, box) => {
      const session = new BuildSession(asPlayerId("p1"));
      session.setFlowForTest(flow);
      const selection = selectionOf(dim, box, stone);
      const taps = { from: box.max, to: box.min };
      session.replaceSelection(selection, taps, OVERWORLD_RANGE);
      if (flow.kind === "selected" || flow.kind === "baseHeight") {
        expect(session.flow).toMatchObject({
          kind: flow.kind,
          ...tappedSelection(selection, taps.from, taps.to),
        });
        if (flow.kind === "baseHeight")
          expect(session.flow).toMatchObject({
            baseBox: boxWithHeight(box, 1),
            liveHeight: Math.min(
              flow.liveHeight,
              selectionHeightLimit(box, OVERWORLD_RANGE),
            ),
          });
      } else expect(session.flow).toBe(flow);
      expect(session.confirmedBox).toBeUndefined();
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
        const box = boxOf(
          cellOf({ x, y: 0, z: 0 }),
          cellOf({ x: x + 4, y: 2, z: 1 }),
        );
        const confirmedDimension = sameDimension
          ? dim
          : asDimensionId("nether");
        session.confirmBox(selectionOf(confirmedDimension, box, stone));
        session.setFlowForTest({
          kind: "selected",
          menuLevel: "root",
          ...tappedSelection(selectionOf(dim, box, stone), box.min, box.max),
        });
        const target = planRotationAboutCenter(box).target;
        session.replaceSelection(
          selectionOf(dim, target, stone),
          cornerTaps(target),
          OVERWORLD_RANGE,
        );
        expect(session.flow).toEqual({
          kind: "selected",
          menuLevel: "root",
          ...tappedSelection(
            selectionOf(dim, target, stone),
            target.min,
            target.max,
          ),
        });
        expect(session.confirmedBox).toEqual({
          material: stone,
          dimensionId: confirmedDimension,
          box: sameDimension ? target : box,
        });
      },
    ),
  );
});

it.each(["endPasting", "leaveBuildMode", "clearSelection"] as const)(
  "%s clears the selection while retaining history",
  (exit) => {
    fc.assert(
      fc.property(recordArb, (record) => {
        const session = new BuildSession(asPlayerId("alex"));
        const box = boxOf(
          cellOf({ x: 0, y: 0, z: 0 }),
          cellOf({ x: 4, y: 2, z: 1 }),
        );
        session.confirmBox(selectionOf(dim, box, stone));
        session.setFlowForTest({
          kind: "selected",
          menuLevel: "root",
          ...tappedSelection(selectionOf(dim, box, stone), box.min, box.max),
        });
        session.finishEdit(record, "undoable");
        session[exit]();
        expect(session.flow).toEqual({ kind: "idle" });
        expect(session.confirmedBox).toBeUndefined();
        expect(session.takeUndo()).toEqual(cells(record));
      }),
    );
  },
);

it("sets the form height only in an unlocked height step", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 15 }),
      fc.constantFrom("gable" as const, "hip" as const),
      (height, kind) => {
        const session = new BuildSession(asPlayerId("builder"));
        const endpoint: BuildFlow = {
          kind: "selected",
          menuLevel: "root",
          ...tappedSelection(
            selectionOf(
              dim,
              boxOf(
                cellOf({ x: 0, y: 60, z: 0 }),
                cellOf({ x: 3, y: 60, z: 4 }),
              ),
              blockStateOf("minecraft:stone"),
            ),
            cellOf({ x: 0, y: 60, z: 0 }),
            cellOf({ x: 3, y: 60, z: 4 }),
          ),
        };
        for (const flow of [
          { kind: "idle" } as const,
          endpoint,
          chooseHeightedFlow(endpoint, kind),
          { kind: "pasteAim", manualTurn: 0 } as const,
        ]) {
          session.setFlowForTest(flow);
          expect(session.setHeight(height)).toBe(flow.kind === "heightStep");
          expect(session.flow).toEqual(
            flow.kind === "heightStep" ? { ...flow, liveHeight: height } : flow,
          );
        }
      },
    ),
  );
});

it("keeps locked box heights unchanged for aiming and explicit heights", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 40 }),
      fc.integer(),
      (height, requested) => {
        const session = new BuildSession(asPlayerId("builder"));
        const flow = chooseHeightedFlow(
          {
            kind: "selected",
            menuLevel: "root",
            ...tappedSelection(
              selectionOf(
                dim,
                boxOf(
                  cellOf({ x: 0, y: 60, z: 0 }),
                  cellOf({ x: 4, y: 60 + height - 1, z: 5 }),
                ),
                blockStateOf("minecraft:stone"),
              ),
              cellOf({ x: 0, y: 60, z: 0 }),
              cellOf({ x: 4, y: 60 + height - 1, z: 5 }),
            ),
          },
          "cylinder",
        );
        session.setFlowForTest(flow);
        expect(session.setHeight(requested)).toBe(false);
        expect(session.flow).toBe(flow);
        expect(
          session.aimHeight(
            {
              origin: { x: -10, y: requested, z: 2 },
              direction: { x: 1, y: 0, z: 0 },
            },
            OVERWORLD_RANGE,
          ),
        ).toBe(false);
        expect(session.flow).toBe(flow);
      },
    ),
  );
});
