import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, boxWithHeight } from "../../../src/domain/build/box";
import { selectionAfterUndo } from "../../../src/domain/build/flow/selectionAfterUndo";
import { cornerTaps } from "../../../src/domain/build/flow/taps";
import { selectionOf } from "../../../src/domain/build/selection";
import { structureHandle } from "../../../src/domain/build/structure/handle";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { tappedSelection } from "../../support/buildSelection";

const dim = asDimensionId("overworld");
const other = asDimensionId("nether");
const material = blockStateOf("minecraft:stone");
const cell = fc
  .record({ x: fc.integer(), y: fc.integer(), z: fc.integer() })
  .map(cellOf);
const handle = structureHandle("undo");

it("restores cell selections only for the active confirmed box and recorded bounds", () => {
  fc.assert(
    fc.property(cell, cell, cell, cell, fc.boolean(), (a, b, c, d, hasTaps) => {
      const before = boxOf(a, b);
      const after = boxOf(c, d);
      const selection = selectionOf(dim, after, material);
      const flow = {
        kind: "selected",
        menuLevel: "root",
        ...tappedSelection(selection, after.min, after.max),
      } as const;
      const taps = { from: a, to: b };
      const record = {
        dimensionId: dim,
        changes: [],
        selectionBefore: before,
        selectionAfter: after,
        ...(hasTaps && { selectionBeforeTaps: taps }),
      };
      const entry = { kind: "cells", record } as const;
      expect(selectionAfterUndo(entry, flow, selection, false)).toEqual({
        restore: {
          selection: selectionOf(dim, before, material),
          taps: hasTaps ? taps : cornerTaps(before),
        },
      });
      const sameBounds = selectionOf(dim, after, material);
      expect(
        selectionAfterUndo(entry, flow, sameBounds, false),
      ).toBeUndefined();
      const differentBox = boxOf(after.min, {
        ...after.max,
        z: after.max.z + 1,
      });
      const differentSelection = selectionOf(dim, differentBox, material);
      expect(
        selectionAfterUndo(
          entry,
          { ...flow, selection: differentSelection },
          differentSelection,
          false,
        ),
      ).toBeUndefined();
      const aiming = {
        kind: "baseHeight",
        ...tappedSelection(selection, after.min, after.max),
        baseBox: boxWithHeight(after, 1),
        liveHeight: 1,
      } as const;
      expect(
        selectionAfterUndo(entry, aiming, selection, false),
      ).toBeUndefined();
    }),
  );
});

it("restarts paste aim only with a clipboard and a matching selected box and dimension", () => {
  const box = boxOf(cellOf({ x: 0, y: 0, z: 0 }), cellOf({ x: 2, y: 2, z: 2 }));
  const selection = selectionOf(dim, box, material);
  const flow = {
    kind: "selected",
    menuLevel: "root",
    ...tappedSelection(selection, box.min, box.max),
  } as const;
  const entry = {
    kind: "snapshot",
    snapshot: { paste: true, dimensionId: dim, handle, box },
  } as const;
  expect(selectionAfterUndo(entry, flow, undefined, true)).toEqual({
    aimPaste: true,
  });
  expect(selectionAfterUndo(entry, flow, selection, false)).toBeUndefined();
  expect(
    selectionAfterUndo(
      entry,
      { ...flow, selection: selectionOf(other, box, material) },
      selection,
      true,
    ),
  ).toBeUndefined();
  expect(
    selectionAfterUndo(
      entry,
      { ...flow, selection: selectionOf(dim, boxWithHeight(box, 1), material) },
      selection,
      true,
    ),
  ).toBeUndefined();
});

it("restores a rotation's selection during height aiming in the recorded dimension", () => {
  const before = boxOf(
    cellOf({ x: 0, y: 0, z: 0 }),
    cellOf({ x: 2, y: 2, z: 4 }),
  );
  const after = boxOf(
    cellOf({ x: 0, y: 0, z: 0 }),
    cellOf({ x: 4, y: 2, z: 2 }),
  );
  const selection = selectionOf(dim, after, material);
  const flow = {
    kind: "baseHeight",
    ...tappedSelection(selection, after.min, after.max),
    baseBox: boxWithHeight(after, 1),
    liveHeight: 2,
  } as const;
  const entry = {
    kind: "snapshot",
    snapshot: { dimensionId: dim, handle, box: after, selectionBefore: before },
  } as const;
  expect(selectionAfterUndo(entry, flow, undefined, false)).toEqual({
    restore: {
      selection: selectionOf(dim, before, material),
      taps: cornerTaps(before),
    },
  });
  expect(
    selectionAfterUndo(
      { ...entry, snapshot: { ...entry.snapshot, dimensionId: other } },
      flow,
      undefined,
      false,
    ),
  ).toBeUndefined();
});
