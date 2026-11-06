import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { freeCellAbove } from "../../../src/domain/build/freeCell";

it("returns the first pair of air cells, preserving the column and treating above the top as air", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -64, max: 319 }),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      fc.array(fc.boolean(), { maxLength: 80 }),
      (y, x, z, air) => {
        const topY = y + air.length - 1;
        const isAir = vi.fn(
          (cell: { x: number; y: number; z: number }) =>
            air[cell.y - y] === true,
        );
        const result = freeCellAbove({ x, y, z }, isAir, topY);
        expect(result).toBeDefined();
        if (!result) return;
        const open = (at: number) => at > topY || air[at - y] === true;
        expect(result.x).toBe(x);
        expect(result.z).toBe(z);
        expect(open(result.y) && open(result.y + 1)).toBe(true);
        for (let below = y; below < result.y; below++)
          expect(open(below) && open(below + 1)).toBe(false);
        expect(isAir.mock.calls.every(([cell]) => cell.y <= topY)).toBe(true);
      },
    ),
  );
});

it("starts at the given cell even when already above the world", () => {
  const isAir = vi.fn(() => false);
  expect(freeCellAbove({ x: 2, y: 400, z: -3 }, isAir, 319)).toEqual({
    x: 2,
    y: 400,
    z: -3,
  });
  expect(isAir).not.toHaveBeenCalled();
});
