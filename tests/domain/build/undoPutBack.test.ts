import fc from "fast-check";
import { expect, it } from "vitest";
import { AIR } from "../../../src/domain/build/blockState";
import {
  takeLast,
  type UndoEntry,
  withPutBack,
} from "../../../src/domain/build/history/history";
import { BuildSession, isEditRefusal } from "../../../src/domain/build/session";
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
      box: { min: cell, max: cell },
      handle: structureHandle(name),
    },
  })),
);

it("take then put back restores every entry in order without trimming or replacing snapshots", () => {
  fc.assert(
    fc.property(fc.array(entry, { minLength: 1, maxLength: 40 }), (entries) => {
      const history = { entries };
      const { entry, rest } = takeLast(history);
      if (!entry) throw new Error("Missing entry");
      expect(withPutBack(rest, entry)).toEqual(history);
      expect(history.entries).toBe(entries);
      const session = new BuildSession(asPlayerId("alex"));
      for (const entry of entries) session.putBackUndo(entry);
      const taken = session.takeUndo();
      if (isEditRefusal(taken)) throw new Error(taken);
      session.putBackUndo(taken);
      for (const entry of [...entries].reverse())
        expect(session.takeUndo()).toBe(entry);
      expect(session.takeUndo()).toBe("nothingToUndo");
    }),
  );
});
