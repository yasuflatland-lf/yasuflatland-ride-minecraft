import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cellKey } from "../../../src/domain/shared/cells";

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
