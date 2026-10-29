import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tableCells, tableYaw } from "../../../src/domain/camp/table";

describe("camp table footprint", () => {
  it("keeps two adjacent ground cells on its long axis for any player turn", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1080, max: 1080 }), (turn) => {
        const yaw = tableYaw(turn);
        const cells = tableCells({ x: 4, y: 7, z: -2 }, yaw);
        expect(cells).toHaveLength(2);
        expect(cells[0]).toEqual({ x: 4, y: 7, z: -2 });
        expect(cells.every((cell) => cell.y === 7)).toBe(true);
        expect(cells[0]?.x === cells[1]?.x || cells[0]?.z === cells[1]?.z).toBe(
          true,
        );
        expect(
          Math.abs((cells[0]?.x ?? 0) - (cells[1]?.x ?? 0)) +
            Math.abs((cells[0]?.z ?? 0) - (cells[1]?.z ?? 0)),
        ).toBe(1);
      }),
    );
  });
});
