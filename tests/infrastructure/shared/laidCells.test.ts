import type { BlockPermutation, Dimension } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import type { LaidCell } from "../../../src/domain/shared/laidCells";
import {
  type CellCodec,
  type CellHolder,
  CellLayer,
  savedLaidCells,
} from "../../../src/infrastructure/shared/laidCells";

type Block = { id: "a" | "b" | "glow"; n: number };
const codec: CellCodec<Block> = {
  property: "test:cells",
  upgrade: (v) => {
    if (typeof v === "object" && v !== null && "legacy" in v) {
      const { legacy, ...cell } = v;
      return { ...cell, block: { id: "a", n: legacy } };
    }
    return v;
  },
  isCell: (v): v is LaidCell<Block> => {
    if (typeof v !== "object" || v === null) return false;
    const c = v as LaidCell<Block>;
    return (
      [c.x, c.y, c.z].every(Number.isInteger) &&
      c.block !== null &&
      typeof c.block === "object" &&
      ["a", "b", "glow"].includes(c.block.id) &&
      Number.isInteger(c.block.n)
    );
  },
  same: (a, b) => a.id === b.id && a.n === b.n,
  blockIdOf: (b) =>
    b.id === "glow" ? "minecraft:light_block_7" : `test:${b.id}`,
  permutationOf: (b) =>
    ({
      typeId: codec.blockIdOf(b),
      states: { n: b.n },
    }) as unknown as BlockPermutation,
};
const cell = (x = 0, id: Block["id"] = "a", n = 0): LaidCell<Block> => ({
  x,
  y: 64,
  z: 0,
  block: { id, n },
});
function fakeDimension(id = "overworld") {
  const blocks = new Map<string, string>();
  const writes: { key: string; typeId: string; kind: string }[] = [];
  let unavailable: "throw" | "undefined" | undefined;
  const at = (c: Cell) => blocks.get(cellKey(c)) ?? "minecraft:air";
  const dimension = {
    id,
    getBlock: (c: Cell) => {
      if (unavailable === "throw") throw new Error("unloaded");
      if (unavailable === "undefined") return undefined;
      return {
        get typeId() {
          return at(c);
        },
        get isAir() {
          return at(c) === "minecraft:air";
        },
        setType: (typeId: string) => {
          writes.push({ key: cellKey(c), typeId, kind: "clear" });
          blocks.set(cellKey(c), typeId);
        },
        setPermutation: (p: { typeId: string }) => {
          writes.push({ key: cellKey(c), typeId: p.typeId, kind: "place" });
          blocks.set(cellKey(c), p.typeId);
        },
      };
    },
  } as unknown as Dimension;
  return {
    dimension,
    blocks,
    writes,
    at,
    unavailable: (mode: typeof unavailable) => {
      unavailable = mode;
    },
  };
}
function fixture(recheckTicks = 1) {
  const world = fakeDimension();
  const saved = new Map<string, unknown>();
  const holder: CellHolder = {
    dimension: world.dimension,
    isValid: true,
    getDynamicProperty: (key) => saved.get(key) as string | undefined,
    setDynamicProperty: vi.fn((key, value) => {
      saved.set(key, value);
    }),
  };
  return {
    ...world,
    saved,
    holder,
    layer: new CellLayer<string, Block>(codec, recheckTicks),
  };
}

describe("CellLayer", () => {
  it("clears before placing, and replaces only air, light, or its own previous block", () => {
    const f = fixture();
    f.blocks.set(cellKey(cell(1)), "minecraft:light_block_15");
    f.blocks.set(cellKey(cell(2)), "test:stone");
    f.layer.lay("one", f.holder, [cell(), cell(1), cell(2)]);
    expect(
      f.layer.ownerOf(asDimensionId("overworld"), cell(2)),
    ).toBeUndefined();
    f.writes.length = 0;
    f.layer.lay("one", f.holder, [cell(1, "b"), cell(3)]);
    expect(f.writes.map((w) => w.kind)).toEqual(["clear", "place", "place"]);
    expect(f.at(cell(2))).toBe("test:stone");
    f.blocks.set(cellKey(cell(1)), "test:stone");
    f.layer.lay("one", f.holder, []);
    expect(f.at(cell(1))).toBe("test:stone");
    expect(
      f.layer.ownerOf(asDimensionId("overworld"), cell(1)),
    ).toBeUndefined();
  });

  it.each(["throw", "undefined"] as const)(
    "keeps and saves unreadable cells (%s), then retries clearing",
    (mode) => {
      const f = fixture();
      f.layer.lay("one", f.holder, [cell()]);
      f.unavailable(mode);
      f.layer.lay("one", f.holder, []);
      expect(f.saved.get(codec.property)).toBe(JSON.stringify([cell()]));
      expect(f.layer.ownerOf(asDimensionId("overworld"), cell())).toBe("one");
      f.unavailable(undefined);
      f.layer.lay("one", f.holder, []);
      expect(f.at(cell())).toBe("minecraft:air");
      expect(f.saved.get(codec.property)).toBeUndefined();
      f.layer.lay("one", f.holder, [cell()]);
      f.unavailable(mode);
      f.layer.clearGone(new Set());
      expect(f.layer.ownerOf(asDimensionId("overworld"), cell())).toBe("one");
      f.unavailable(undefined);
      f.layer.clearGone(new Set());
      expect(f.at(cell())).toBe("minecraft:air");
    },
  );

  it("keeps its own light and restores air or another light", () => {
    const f = fixture();
    const glow = cell(0, "glow");
    f.layer.lay("one", f.holder, [glow]);
    f.writes.length = 0;
    f.layer.lay("one", f.holder, [glow]);
    expect(f.writes).toEqual([]);
    for (const typeId of ["minecraft:light_block_15", "minecraft:air"]) {
      f.blocks.set(cellKey(glow), typeId);
      f.layer.lay("one", f.holder, [glow]);
      expect(f.at(glow)).toBe("minecraft:light_block_7");
    }
    expect(f.writes).toHaveLength(2);
  });

  it("rechecks at the configured cadence", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (ticks) => {
        const f = fixture(ticks);
        f.layer.lay("one", f.holder, [cell()]);
        for (let k = 1; k <= ticks * 3; k++) {
          f.blocks.set(cellKey(cell()), "minecraft:air");
          f.writes.length = 0;
          f.layer.lay("one", f.holder, [cell()]);
          expect(f.writes.length).toBe(k % ticks === 0 ? 1 : 0);
        }
      }),
    );
  });

  it("persists only changed JSON and never writes an invalid holder", () => {
    const f = fixture();
    f.layer.lay("one", f.holder, [cell()]);
    expect(f.saved.get(codec.property)).toBe(JSON.stringify([cell()]));
    f.layer.lay("one", f.holder, [cell()]);
    expect(f.holder.setDynamicProperty).toHaveBeenCalledTimes(1);
    f.layer.lay("one", f.holder, []);
    expect(f.holder.setDynamicProperty).toHaveBeenLastCalledWith(
      codec.property,
      undefined,
    );
    const invalid = { ...f.holder, isValid: false };
    f.layer.lay("one", invalid, [cell()]);
    expect(f.holder.setDynamicProperty).toHaveBeenCalledTimes(2);
  });

  it("only clears gone holders and preserves live owners", () => {
    const f = fixture();
    f.layer.lay("unknown", undefined, [cell()]);
    expect(f.writes).toEqual([]);
    f.layer.lay("one", f.holder, [cell()]);
    f.layer.lay("one", undefined, [cell(1)]);
    expect(f.at(cell())).toBe("minecraft:air");
    expect(f.at(cell(1))).toBe("minecraft:air");
    f.layer.lay("one", f.holder, [cell()]);
    const other = { ...f.holder, getDynamicProperty: () => undefined };
    f.layer.lay("two", other, [cell(1)]);
    f.layer.clearGone(new Set(["two"]));
    expect(f.at(cell())).toBe("minecraft:air");
    expect(f.at(cell(1))).toBe("test:a");
  });

  it("clears the old dimension and retries stranded cells until readable", () => {
    const f = fixture();
    const next = fakeDimension("nether");
    f.layer.lay("one", f.holder, [cell()]);
    f.unavailable("throw");
    f.layer.lay("one", { ...f.holder, dimension: next.dimension }, [cell(1)]);
    expect(next.at(cell(1))).toBe("test:a");
    f.layer.clearGone(new Set(["one"]));
    expect(f.at(cell())).toBe("test:a");
    f.unavailable(undefined);
    f.layer.clearGone(new Set(["one"]));
    expect(f.at(cell())).toBe("minecraft:air");
    expect(next.at(cell(1))).toBe("test:a");
    f.layer.lay("one", f.holder, []);
    expect(next.at(cell(1))).toBe("minecraft:air");
  });

  it("looks up the first owner by dimension, predicate, and exact block id", () => {
    const f = fixture();
    f.layer.lay("one", f.holder, [cell()]);
    const other = {
      ...f.holder,
      getDynamicProperty: () => JSON.stringify([cell()]),
    };
    f.layer.lay("two", other, [cell()]);
    const d = asDimensionId("overworld");
    expect(f.layer.ownerOf(d, cell())).toBe("one");
    expect(f.layer.ownerOf(asDimensionId("nether"), cell())).toBeUndefined();
    expect(f.layer.ownerOf(d, cell(), (b) => b.id === "b")).toBeUndefined();
    expect(f.layer.laidBlockOwner(d, cell(), "test:a")).toBe("one");
    expect(f.layer.laidBlockOwner(d, cell(), "test:b")).toBeUndefined();
  });
});

it("upgrades before validation and ignores unreadable or invalid saved entries without writing", () => {
  const f = fixture();
  f.saved.set(
    codec.property,
    JSON.stringify([{ x: 0, y: 64, z: 0, legacy: 2 }, "junk", { x: 1 }]),
  );
  expect(savedLaidCells(f.holder, codec)).toEqual([cell(0, "a", 2)]);
  for (const raw of [undefined, 12, "{}", "bad", '["junk"]']) {
    f.saved.set(codec.property, raw);
    expect(savedLaidCells(f.holder, codec)).toEqual([]);
  }
  expect(f.holder.setDynamicProperty).not.toHaveBeenCalled();
});
