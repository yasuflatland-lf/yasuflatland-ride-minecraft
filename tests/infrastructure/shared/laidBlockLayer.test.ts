import type { Dimension } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  LaidBlockLayer,
  readLaidCells,
  writeLaidCells,
} from "../../../src/infrastructure/shared/laidBlockLayer";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: { resolve: (id: string) => id },
}));

it("round trips integer ceiling records and omits empty records", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
      ),
      (cells) => {
        expect(readLaidCells(writeLaidCells(cells))).toEqual(cells);
      },
    ),
  );
  expect(writeLaidCells([])).toBeUndefined();
});

it("shares one warning across block failures and persistence failures for each operation", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const dimension = {
    id: "overworld",
    getBlock: vi.fn(() => {
      throw new Error("unloaded");
    }),
  } as unknown as Dimension;
  const layer = new LaidBlockLayer("test:ceiling", () => false, "test shelter");
  const cells = [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  ];
  try {
    const warn = layer.warning("lay");
    expect(layer.lay(dimension, cells, [], warn)).toEqual([]);
    warn(new Error("property save"));
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("test shelter lay failed"),
    );
    layer.clear(dimension, cells);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenLastCalledWith(
      expect.stringContaining("test shelter clear failed"),
    );
  } finally {
    warning.mockRestore();
  }
});

it("uses the configured block and preserves replacements and unrecorded ceilings", () => {
  const blocks = new Map([
    [0, { typeId: "minecraft:air", isAir: true, setPermutation: vi.fn() }],
    [1, { typeId: "test:ceiling", isAir: false, setPermutation: vi.fn() }],
    [2, { typeId: "minecraft:stone", isAir: false, setPermutation: vi.fn() }],
  ]);
  const dimension = {
    id: "overworld",
    getBlock: ({ x }: { x: number }) => blocks.get(x),
  } as unknown as Dimension;
  const cells = [0, 1, 2].map((x) => ({ x, y: 4, z: 0 }));
  const layer = new LaidBlockLayer("test:ceiling", () => false, "test shelter");
  expect(layer.lay(dimension, cells, [])).toEqual([cells[0]]);
  expect(blocks.get(0)?.setPermutation).toHaveBeenCalledWith("test:ceiling");
  layer.clear(dimension, cells.slice(1));
  expect(blocks.get(1)?.setPermutation).toHaveBeenCalledWith("minecraft:air");
  expect(blocks.get(2)?.setPermutation).not.toHaveBeenCalled();
});
