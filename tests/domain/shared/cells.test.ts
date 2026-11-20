import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  cellCenter,
  cellKey,
  cellOf,
  offsetToCellCenter,
  sameCell,
} from "../../../src/domain/shared/cells";

import { sameLocalCell } from "../../../src/domain/vehicle/kinds/camper/furniture";

const cell = fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() });

it("compares integer cells reflexively and symmetrically by their keys", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      expect(sameCell(a, b)).toBe(cellKey(a) === cellKey(b));
      expect(sameCell(a, a)).toBe(true);
      expect(sameCell(a, b)).toBe(sameCell(b, a));
      for (const axis of ["x", "y", "z"] as const) {
        const other = { ...a, [axis]: b[axis] };
        expect(sameCell(a, other)).toBe(cellKey(a) === cellKey(other));
      }
    }),
  );
});

it("centers a cell at the requested height within the same block", () => {
  const height = fc.integer({ min: 0, max: 65535 }).map((n) => n / 65536);
  fc.assert(
    fc.property(cell, height, (c, dy) => {
      expect(cellCenter(c, dy)).toEqual({
        x: c.x + 0.5,
        y: c.y + dy,
        z: c.z + 0.5,
      });
      expect(cellOf(cellCenter(c, dy))).toEqual(c);
      expect(cellCenter(c)).toEqual(cellCenter(c, 0));
    }),
  );
});

it("offsets a position to the cell midpoint on all three axes", () => {
  const coordinate = fc.double({ min: -1e6, max: 1e6, noNaN: true });
  const from = fc.record({ x: coordinate, y: coordinate, z: coordinate });
  const index = fc.integer({ min: -1e6, max: 1e6 });
  fc.assert(
    fc.property(from, fc.record({ x: index, y: index, z: index }), (p, c) => {
      const offset = offsetToCellCenter(p, c);
      const target = cellCenter(c, 0.5);
      for (const axis of ["x", "y", "z"] as const) {
        expect(
          Math.abs(p[axis] + offset[axis] - target[axis]),
        ).toBeLessThanOrEqual(1e-9);
      }
    }),
  );
});

describe("cellKey", () => {
  it("has equal keys exactly when integer cells have equal coordinates", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        expect(cellKey(a) === cellKey(b)).toBe(
          a.x === b.x && a.y === b.y && a.z === b.z,
        );
        expect(cellKey(a)).toBe(cellKey({ ...a }));
      }),
    );
  });

  it("round-trips integer coordinates through the saved key", () => {
    fc.assert(
      fc.property(cell, (c) => {
        expect(cellKey(c).split(",").map(Number)).toEqual([c.x, c.y, c.z]);
      }),
    );
  });

  it("preserves the saved comma-separated format", () => {
    expect(cellKey({ x: -3, y: 64, z: 0 })).toBe("-3,64,0");
  });
});

describe("cellOf", () => {
  const coordinate = fc.double({ noNaN: true, noDefaultInfinity: true });
  const position = fc.record({ x: coordinate, y: coordinate, z: coordinate });

  it("floors every axis and is idempotent", () => {
    fc.assert(
      fc.property(position, (v) => {
        const c = cellOf(v);
        expect(c).toEqual({
          x: Math.floor(v.x),
          y: Math.floor(v.y),
          z: Math.floor(v.z),
        });
        expect(Object.values(c).every(Number.isInteger)).toBe(true);
        expect(cellOf(c)).toEqual(c);
      }),
    );
  });

  it("rounds negative fractional coordinates down, not toward zero", () => {
    const negative = fc.integer({ min: -3e7, max: -1 });
    fc.assert(
      fc.property(fc.record({ x: negative, y: negative, z: negative }), (c) => {
        expect(cellOf({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 })).toEqual(c);
      }),
    );
  });
});

it("compares camper room cells by x, z and layer", () => {
  const c = { x: -1, z: 2, layer: 1 };
  expect(sameLocalCell(c, { ...c })).toBe(true);
  for (const axis of ["x", "z", "layer"] as const) {
    expect(sameLocalCell(c, { ...c, [axis]: c[axis] + 1 })).toBe(false);
  }
});
