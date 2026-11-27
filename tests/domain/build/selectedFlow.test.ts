import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  confirmedSelection,
  keptSelection,
} from "../../../src/domain/build/flow/selectedFlow";
import { selectionOf } from "../../../src/domain/build/selection";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";

const cell = fc
  .record({
    x: fc.integer({ min: -100, max: 100 }),
    y: fc.integer({ min: -100, max: 100 }),
    z: fc.integer({ min: -100, max: 100 }),
  })
  .map(cellOf);
const input = fc.tuple(cell, cell).map(([from, to]) => {
  const dimensionId = asDimensionId("minecraft:overworld");
  const material = blockStateOf("minecraft:stone");
  return {
    start: { dimensionId, cell: from, material },
    selection: selectionOf(dimensionId, boxOf(from, to), material),
    taps: { from, to },
  };
});

it("preserves the line confirmation literal", () => {
  fc.assert(
    fc.property(input, ({ start, selection, taps }) => {
      const flow = confirmedSelection({
        start,
        selection,
        taps,
        freshEnd: true,
      });
      expect(Object.isFrozen(flow)).toBe(true);
      expect(flow).toEqual({
        kind: "selected",
        start,
        freshEnd: true,
        menuLevel: "root",
        selection,
        taps,
      });
      expect(JSON.stringify(flow)).toBe(
        JSON.stringify({
          kind: "selected",
          start,
          freshEnd: true,
          menuLevel: "root",
          selection,
          taps,
        }),
      );
    }),
  );
});

it("preserves the confirmed height and kept selection literals", () => {
  fc.assert(
    fc.property(input, ({ start, selection, taps }) => {
      const expected = {
        kind: "selected",
        menuLevel: "root",
        selection,
        start,
        taps,
      };
      for (const flow of [
        confirmedSelection({ start, selection, taps }),
        keptSelection({ start, selection, taps }),
      ]) {
        expect(Object.isFrozen(flow)).toBe(true);
        expect(flow).toEqual(expected);
        expect(Object.hasOwn(flow, "freshEnd")).toBe(false);
        expect(JSON.stringify(flow)).toBe(JSON.stringify(expected));
      }
    }),
  );
});
