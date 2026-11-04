import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellKey, cellOf } from "../../../src/domain/shared/cells";

const cell = fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() });

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
  const coordinate = fc.double({ min: -3e7, max: 3e7, noNaN: true });
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
