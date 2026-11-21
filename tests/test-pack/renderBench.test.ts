import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { gridCells } from "../../src/test-pack/renderBench";

vi.mock("@minecraft/server", () => ({
  system: { afterEvents: { scriptEventReceive: { subscribe: vi.fn() } } },
}));

it("fills rows in order and stops at the requested count", () => {
  expect(gridCells(5, 6)).toEqual([
    { x: 0, z: 0 },
    { x: 6, z: 0 },
    { x: 12, z: 0 },
    { x: 0, z: 6 },
    { x: 6, z: 6 },
  ]);
});

it("keeps every cell distinct and inside the smallest square grid", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 64 }),
      fc.constantFrom(1, 6),
      (count, spacing) => {
        const cells = gridCells(count, spacing);
        expect(cells).toHaveLength(count);
        expect(new Set(cells.map(({ x, z }) => `${x},${z}`)).size).toBe(count);
        for (const { x, z } of cells) {
          for (const coordinate of [x, z]) {
            expect(coordinate % spacing).toBe(0);
            expect(coordinate).toBeGreaterThanOrEqual(0);
            expect(coordinate).toBeLessThan(
              Math.ceil(Math.sqrt(count)) * spacing,
            );
          }
        }
      },
    ),
  );
});
