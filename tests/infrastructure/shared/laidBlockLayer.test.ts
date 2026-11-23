import type { Dimension } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { SingleBlockLayer } from "../../../src/infrastructure/shared/laidBlockLayer";
import type { CellHolder } from "../../../src/infrastructure/shared/laidCells";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: { resolve: (id: string) => id },
}));

const BLOCK = "test:ceiling";
const PROPERTY = "test:cells";
const AIR = "minecraft:air";
const STONE = "minecraft:stone";
const DIMENSION = asDimensionId("overworld");
const OWNER = "shelter";
const first = { x: 0, y: 4, z: 0 };
const second = { x: 1, y: 4, z: 0 };
const third = { x: 2, y: 4, z: 0 };

function fixture(saved?: string, dimensionId = DIMENSION) {
  const blocks = new Map<string, string>();
  function blockAt(cell: Cell) {
    const key = cellKey(cell);
    const typeId = blocks.get(key) ?? AIR;
    return {
      typeId,
      isAir: typeId === AIR,
      setPermutation: (next: string) => blocks.set(key, next),
    };
  }
  const getBlock =
    vi.fn<(cell: Cell) => ReturnType<typeof blockAt> | undefined>(blockAt);
  const properties = new Map<string, string>();
  if (saved !== undefined) properties.set(PROPERTY, saved);
  const holder: CellHolder = {
    dimension: { id: dimensionId, getBlock } as unknown as Dimension,
    isValid: true,
    getDynamicProperty: (name) => properties.get(name),
    setDynamicProperty: vi.fn((name, value) => {
      if (typeof value === "string") properties.set(name, value);
      else properties.delete(name);
    }),
  };
  const layer = new SingleBlockLayer<string>(
    BLOCK,
    PROPERTY,
    () => false,
    "test shelter",
  );
  return { blocks, getBlock, holder, layer, properties };
}

it("round trips integer cells in the flat saved format and omits empty records", () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        { selector: cellKey },
      ),
      (cells) => {
        const { holder, layer, properties } = fixture();
        layer.lay(OWNER, holder, cells);
        const saved = properties.get(PROPERTY);
        expect(saved).toBe(
          cells.length > 0 ? JSON.stringify(cells) : undefined,
        );
        const restored = fixture(saved);
        expect(restored.layer.heldCells(OWNER, restored.holder)).toEqual(cells);
      },
    ),
  );
});

it("shares one warning across block failures and persistence failures for each operation", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { holder, getBlock, layer } = fixture(JSON.stringify([first, second]));
  getBlock.mockImplementation(() => {
    throw new Error("unloaded");
  });
  vi.mocked(holder.setDynamicProperty).mockImplementation(() => {
    throw new Error("property save");
  });
  try {
    layer.lay(OWNER, holder, [first, second]);
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("test shelter lay failed"),
    );
    layer.clear(OWNER, holder);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenLastCalledWith(
      expect.stringContaining("test shelter clear failed"),
    );
  } finally {
    warning.mockRestore();
  }
});

it("returns only unreadable recorded cells for a later clear", () => {
  const { blocks, getBlock, holder, layer, properties } = fixture(
    JSON.stringify([first, second, third]),
  );
  blocks.set(cellKey(third), STONE);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  getBlock
    .mockImplementationOnce(() => {
      throw new Error("unloaded chunk");
    })
    .mockReturnValueOnce(undefined);
  try {
    expect(layer.clear(OWNER, holder)).toEqual([first, second]);
    expect(properties.get(PROPERTY)).toBe(JSON.stringify([first, second]));
    expect(blocks.get(cellKey(third))).toBe(STONE);
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});

it("lays in the holder's new dimension and retries stale cells in the old one", () => {
  const f = fixture();
  const nether = asDimensionId("nether");
  const moved = fixture(undefined, nether);
  f.layer.lay(OWNER, f.holder, [first]);
  f.getBlock.mockReturnValueOnce(undefined);
  f.layer.lay(OWNER, moved.holder, [first]);
  expect(moved.blocks.get(cellKey(first))).toBe(BLOCK);
  expect(moved.properties.get(PROPERTY)).toBe(JSON.stringify([first]));
  expect(f.layer.ownerOf(DIMENSION, first, BLOCK)).toBe(OWNER);
  expect(f.layer.ownerOf(nether, first, BLOCK)).toBe(OWNER);
  f.layer.lay(OWNER, moved.holder, [first]);
  expect(f.blocks.get(cellKey(first))).toBe(AIR);
  expect(f.layer.ownerOf(DIMENSION, first, BLOCK)).toBeUndefined();
  expect(moved.blocks.get(cellKey(first))).toBe(BLOCK);
});

it("claims only placed blocks and resolves owners only for the matching dimension and type", () => {
  const { blocks, holder, layer } = fixture();
  blocks.set(cellKey(second), BLOCK);
  blocks.set(cellKey(third), STONE);
  layer.lay(OWNER, holder, [first, second, third]);
  expect(layer.ownerOf(DIMENSION, first, BLOCK)).toBe(OWNER);
  expect(layer.ownerOf(DIMENSION, second, BLOCK)).toBeUndefined();
  expect(layer.ownerOf(DIMENSION, first, STONE)).toBeUndefined();
  expect(layer.ownerOf(asDimensionId("nether"), first, BLOCK)).toBeUndefined();

  expect(layer.clear(OWNER)).toEqual([]);
  expect(blocks.get(cellKey(first))).toBe(AIR);
  expect(blocks.get(cellKey(second))).toBe(BLOCK);
  expect(blocks.get(cellKey(third))).toBe(STONE);
});
