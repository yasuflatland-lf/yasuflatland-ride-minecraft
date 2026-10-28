import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { GAS_LANTERN_CELL_CODEC as codec } from "../../../src/infrastructure/camp/bedrock/gasLanternLight";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: { resolve: vi.fn((id) => ({ id })) },
}));

it("accepts well-formed saved cells and resolves the light level", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer(),
        y: fc.integer(),
        z: fc.integer(),
        block: fc.record({ level: fc.integer({ min: 0, max: 15 }) }),
      }),
      (cell) => {
        expect(codec.isCell(cell)).toBe(true);
        expect(codec.upgrade(cell)).toBe(cell);
        expect(codec.blockIdOf(cell.block)).toBe(
          `minecraft:light_block_${cell.block.level}`,
        );
        expect(codec.permutationOf(cell.block)).toEqual({
          id: codec.blockIdOf(cell.block),
        });
        expect(codec.same(cell.block, { level: cell.block.level })).toBe(true);
        expect(
          codec.same(cell.block, { level: (cell.block.level + 1) % 16 }),
        ).toBe(false);
      },
    ),
  );
});

it("rejects malformed coordinates and light levels", () => {
  const good = { x: 0, y: 0, z: 0, block: { level: 15 } };
  for (const value of [
    null,
    [],
    {},
    { ...good, block: null },
    ...["x", "y", "z"].flatMap((axis) =>
      [undefined, "1", 0.5, NaN, Infinity].map((v) => ({ ...good, [axis]: v })),
    ),
    ...[undefined, "15", -1, 16, 1.5, NaN, Infinity].map((level) => ({
      ...good,
      block: { level },
    })),
  ])
    expect(codec.isCell(value)).toBe(false);
});
