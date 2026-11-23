import fc from "fast-check";
import { expect, it } from "vitest";
import { AIR } from "../../../src/domain/build/blockState";
import { boxOf, cellBox } from "../../../src/domain/build/box";
import {
  EMPTY_HISTORY,
  takeLast,
  type UndoEntry,
  withEntry,
  withPutBack,
} from "../../../src/domain/build/history/history";
import { BuildSession, isEditRefusal } from "../../../src/domain/build/session";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { structureHandle } from "../../../src/domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const dimensionId = asDimensionId("minecraft:overworld");
const cell = fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() });
const entry: fc.Arbitrary<UndoEntry> = fc.oneof(
  cell.map((cell) => ({
    kind: "cells" as const,
    record: { dimensionId, changes: [{ cell, before: AIR, after: AIR }] },
  })),
  fc.tuple(cell, fc.string({ minLength: 1 })).map(([cell, name]) => ({
    kind: "snapshot" as const,
    snapshot: {
      dimensionId,
      box: cellBox(cell, cell),
      handle: structureHandle(name),
    },
  })),
);

it("take then put back restores every entry in order without trimming or replacing snapshots", () => {
  fc.assert(
    fc.property(fc.array(entry, { minLength: 1, maxLength: 40 }), (entries) => {
      const history = entries.reduce(
        (history, entry) =>
          withEntry(history, entry, BUILD_SPEC.undoDepth).history,
        EMPTY_HISTORY,
      );
      const { entry, rest } = takeLast(history);
      if (!entry) throw new Error("Missing entry");
      expect(withPutBack(rest, entry)).toEqual(history);
      expect(history.entries).toEqual(entries.slice(-BUILD_SPEC.undoDepth));
      const session = new BuildSession(asPlayerId("alex"));
      for (const entry of history.entries) session.putBackUndo(entry);
      const taken = session.takeUndo();
      if (isEditRefusal(taken)) throw new Error(taken);
      session.putBackUndo(taken);
      for (const entry of [...history.entries].reverse())
        expect(session.takeUndo()).toBe(entry);
      expect(session.takeUndo()).toBe("nothingToUndo");
    }),
  );
});

it("retains optional pre-edit selections on the newest entries after eviction", () => {
  const selection = fc.option(
    fc.tuple(cell, cell).map(([a, b]) => boxOf(a, b)),
    { nil: undefined },
  );
  const historyEntry = fc
    .tuple(entry, selection)
    .map(([item, selectionBefore]): UndoEntry => {
      if (!selectionBefore) return item;
      return item.kind === "cells"
        ? { kind: "cells", record: { ...item.record, selectionBefore } }
        : { kind: "snapshot", snapshot: { ...item.snapshot, selectionBefore } };
    });
  const depth = BUILD_SPEC.undoDepth;
  fc.assert(
    fc.property(
      fc.array(historyEntry, { minLength: depth + 1, maxLength: depth * 2 }),
      (entries) => {
        let history = entries.reduce(
          (h, item) => withEntry(h, item, depth).history,
          EMPTY_HISTORY,
        );
        for (const expected of entries.slice(-depth).reverse()) {
          const { entry: taken, rest } = takeLast(history);
          expect(taken).toStrictEqual(expected);
          if (!taken) throw new Error("Missing entry");
          expect(takeLast(withPutBack(rest, taken)).entry).toStrictEqual(
            expected,
          );
          history = rest;
        }
        expect(history).toStrictEqual(EMPTY_HISTORY);
      },
    ),
  );
});
