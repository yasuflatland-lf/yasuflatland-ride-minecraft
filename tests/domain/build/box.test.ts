import fc from "fast-check";
import { expect, it } from "vitest";
import {
  boxFromSize,
  boxWithHeight,
  type CellBox,
  cellBox,
  contains,
  sizeOf,
  unionOf,
} from "../../../src/domain/build/box";
import { cellOf } from "../../../src/domain/shared/cells";

const axes = ["x", "y", "z"] as const;
const coordinate = fc.integer({ min: -30_000_000, max: 30_000_000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const extent = fc.integer({ min: 1, max: 384 });
const size = fc.record({ x: extent, y: extent, z: extent });
const nonFinite = fc.constantFrom(
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
);
const invalidExtent = fc.oneof(
  fc.integer({ max: 0 }),
  extent.map((value) => value + 0.5),
  nonFinite,
);

function expectOrderedAndFrozen(box: CellBox): void {
  const { min, max } = box;
  for (const axis of axes) expect(min[axis]).toBeLessThanOrEqual(max[axis]);
  expect(Object.isFrozen(box)).toBe(true);
  expect(Object.isFrozen(min)).toBe(true);
  expect(Object.isFrozen(max)).toBe(true);
}

it("normalizes each pair of corner coordinates and freezes the box", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const box = cellBox(cellOf(a), cellOf(b));
      expectOrderedAndFrozen(box);
      for (const axis of axes) {
        expect([box.min[axis], box.max[axis]]).toEqual(
          [a[axis], b[axis]].sort((left, right) => left - right),
        );
      }
    }),
  );
});

it("rejects non-finite corner coordinates", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom(...axes),
      nonFinite,
      (a, b, axis, value) => {
        expect(() =>
          cellBox(cellOf(a), cellOf({ ...b, [axis]: value })),
        ).toThrow(RangeError);
      },
    ),
  );
});

it("builds a frozen box from the minimum corner and inclusive size", () => {
  fc.assert(
    fc.property(cell, size, (min, dimensions) => {
      const box = boxFromSize(cellOf(min), dimensions);
      expectOrderedAndFrozen(box);
      expect(box.min).toEqual(min);
      expect(sizeOf(box)).toEqual(dimensions);
      expect(Object.isFrozen(min)).toBe(false);
    }),
  );
});

it("rejects a size with any dimension that is not a positive integer", () => {
  fc.assert(
    fc.property(
      cell,
      size,
      fc.constantFrom(...axes),
      invalidExtent,
      (min, dimensions, axis, value) => {
        expect(() =>
          boxFromSize(cellOf(min), { ...dimensions, [axis]: value }),
        ).toThrow(RangeError);
      },
    ),
  );
});

it("sets the inclusive height of a frozen box while preserving its base", () => {
  fc.assert(
    fc.property(cell, cell, extent, (a, b, height) => {
      const base = cellBox(cellOf(a), cellOf(b));
      const box = boxWithHeight(base, height);
      expectOrderedAndFrozen(box);
      expect(box.min).toEqual(base.min);
      expect(box.max).toEqual({ ...base.max, y: base.min.y + height - 1 });
    }),
  );
});

it("rejects heights that are not positive integers", () => {
  fc.assert(
    fc.property(cell, cell, invalidExtent, (a, b, height) => {
      expect(() =>
        boxWithHeight(cellBox(cellOf(a), cellOf(b)), height),
      ).toThrow(RangeError);
    }),
  );
});

it("returns a frozen union containing both boxes", () => {
  fc.assert(
    fc.property(cell, cell, cell, cell, (a, b, c, d) => {
      const box = unionOf(
        cellBox(cellOf(a), cellOf(b)),
        cellBox(cellOf(c), cellOf(d)),
      );
      expectOrderedAndFrozen(box);
      for (const corner of [a, b, c, d])
        expect(contains(box, cellOf(corner))).toBe(true);
    }),
  );
});
