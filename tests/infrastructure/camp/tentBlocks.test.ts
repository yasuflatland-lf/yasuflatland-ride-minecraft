import { BlockPermutation, type Dimension } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  asTentId,
  PITCHED_STATE,
  type TentBlock,
  type TentPose,
  tentCells,
} from "../../../src/domain/camp/tent";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import type { LaidCell } from "../../../src/domain/shared/laidCells";
import {
  createTentBlocks,
  TENT_CELL_CODEC,
} from "../../../src/infrastructure/camp/bedrock/tentBlocks";
import {
  TENT_CEILING_BLOCK,
  TENT_FACE_STATE,
  TENT_FLAP_BLOCK,
  TENT_MATTRESS_BLOCK,
  TENT_OPEN_STATE,
  TENT_WALL_BLOCK,
} from "../../../src/infrastructure/camp/identifiers";
import {
  type CellHolder,
  savedLaidCells,
} from "../../../src/infrastructure/shared/laidCells";
import { defined } from "../../support/defined";

vi.mock("@minecraft/server", () => ({
  BlockPermutation: {
    resolve: vi.fn((id: string, states?: Record<string, unknown>) => ({
      id,
      states,
    })),
  },
}));

const SAVED =
  '[{"x":110,"y":-60,"z":49,"block":{"type":"wall","face":1}},{"x":110,"y":-57,"z":50,"block":{"type":"ceiling"}}]';

describe("TENT_CELL_CODEC (ADR 0131)", () => {
  it("saves under yasu_ride:tent_cells", () => {
    expect(TENT_CELL_CODEC.property).toBe("yasu_ride:tent_cells");
  });

  it("accepts the saved shape and rejects malformed cells", () => {
    for (const cell of JSON.parse(SAVED))
      expect(TENT_CELL_CODEC.isCell(cell)).toBe(true);
    for (const bad of [
      null,
      { x: 1, y: 2, z: 3 },
      { x: 1.5, y: 2, z: 3, block: { type: "ceiling" } },
      { x: 1, y: "2", z: 3, block: { type: "ceiling" } },
      { x: 1, y: 2, z: 3, block: { type: "wall", face: 4 } },
      { x: 1, y: 2, z: 3, block: { type: "wall" } },
      { x: 1, y: 2, z: 3, block: { type: "floor" } },
    ])
      expect(TENT_CELL_CODEC.isCell(bad)).toBe(false);
  });

  it("reads the saved shape back unchanged", () => {
    const holder = { getDynamicProperty: vi.fn(() => SAVED) };
    expect(savedLaidCells(holder, TENT_CELL_CODEC)).toEqual(JSON.parse(SAVED));
    expect(holder.getDynamicProperty).toHaveBeenCalledWith(
      "yasu_ride:tent_cells",
    );
  });

  it("compares the type and the face", () => {
    const wall = (face: 0 | 1 | 2 | 3): TentBlock => ({ type: "wall", face });
    const ceiling: TentBlock = { type: "ceiling" };
    expect(TENT_CELL_CODEC.same(wall(1), wall(1))).toBe(true);
    expect(TENT_CELL_CODEC.same(wall(1), wall(2))).toBe(false);
    expect(TENT_CELL_CODEC.same(wall(1), ceiling)).toBe(false);
    expect(TENT_CELL_CODEC.same(ceiling, wall(0))).toBe(false);
    expect(TENT_CELL_CODEC.same(ceiling, { type: "ceiling" })).toBe(true);
  });

  it("names and resolves each block", () => {
    expect(TENT_CELL_CODEC.blockIdOf({ type: "wall", face: 2 })).toBe(
      TENT_WALL_BLOCK,
    );
    expect(TENT_CELL_CODEC.blockIdOf({ type: "ceiling" })).toBe(
      TENT_CEILING_BLOCK,
    );
    TENT_CELL_CODEC.permutationOf({ type: "wall", face: 3 });
    expect(BlockPermutation.resolve).toHaveBeenLastCalledWith(TENT_WALL_BLOCK, {
      [TENT_FACE_STATE]: 3,
    });
    TENT_CELL_CODEC.permutationOf({ type: "ceiling" });
    expect(BlockPermutation.resolve).toHaveBeenLastCalledWith(
      TENT_CEILING_BLOCK,
    );
  });

  describe("flap cells (ADR 0132)", () => {
    const FLAP_SAVED =
      '{"x":110,"y":-60,"z":48,"block":{"type":"flap","id":"front","open":false}}';
    const flap = (
      open: boolean,
      id: "front" | "left" = "front",
    ): TentBlock => ({
      type: "flap",
      id,
      open,
    });

    it("maps a flap to tent_flap with its open state", () => {
      for (const open of [false, true]) {
        expect(TENT_CELL_CODEC.blockIdOf(flap(open))).toBe(TENT_FLAP_BLOCK);
        TENT_CELL_CODEC.permutationOf(flap(open));
        expect(BlockPermutation.resolve).toHaveBeenLastCalledWith(
          TENT_FLAP_BLOCK,
          { [TENT_OPEN_STATE]: open },
        );
      }
      expect(TENT_FLAP_BLOCK).toBe("yasu_ride:tent_flap");
      expect(TENT_OPEN_STATE).toBe("yasu_ride:open");
    });

    it("accepts the saved flap shape and rejects an unknown flap or a non-boolean open", () => {
      expect(TENT_CELL_CODEC.isCell(JSON.parse(FLAP_SAVED))).toBe(true);
      const cell = (block: unknown) => ({ x: 1, y: 2, z: 3, block });
      for (const bad of [
        { type: "flap", id: "door", open: false },
        { type: "flap", id: "front", open: 0 },
        { type: "flap", id: "front" },
        { type: "flap", open: true },
      ])
        expect(TENT_CELL_CODEC.isCell(cell(bad))).toBe(false);
      // The walls and ceilings saved before this change still load.
      for (const saved of JSON.parse(SAVED))
        expect(TENT_CELL_CODEC.isCell(saved)).toBe(true);
    });

    it("tells open from closed, one flap from another, and a flap from a wall", () => {
      expect(TENT_CELL_CODEC.same(flap(true), flap(true))).toBe(true);
      expect(TENT_CELL_CODEC.same(flap(true), flap(false))).toBe(false);
      expect(TENT_CELL_CODEC.same(flap(true), flap(true, "left"))).toBe(false);
      expect(TENT_CELL_CODEC.same(flap(false), { type: "wall", face: 1 })).toBe(
        false,
      );
      expect(TENT_CELL_CODEC.same({ type: "wall", face: 1 }, flap(false))).toBe(
        false,
      );
      expect(TENT_CELL_CODEC.same({ type: "ceiling" }, flap(false))).toBe(
        false,
      );
    });
  });
});

describe("tent mattress cells (ADR 0092, 0133)", () => {
  const mattress = (index: 0 | 1): TentBlock => ({ type: "mattress", index });
  const others: TentBlock[] = [
    { type: "ceiling" },
    { type: "wall", face: 0 },
    { type: "wall", face: 3 },
  ];

  it("names both mattresses TENT_MATTRESS_BLOCK", () => {
    expect(TENT_CELL_CODEC.blockIdOf(mattress(0))).toBe(TENT_MATTRESS_BLOCK);
    expect(TENT_CELL_CODEC.blockIdOf(mattress(1))).toBe(TENT_MATTRESS_BLOCK);
  });

  it("is the same mattress exactly when the indexes match, and never another type", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<0 | 1>(0, 1),
        fc.constantFrom<0 | 1>(0, 1),
        fc.constantFrom(...others),
        (a, b, other) => {
          expect(TENT_CELL_CODEC.same(mattress(a), mattress(b))).toBe(a === b);
          expect(TENT_CELL_CODEC.same(mattress(a), other)).toBe(false);
          expect(TENT_CELL_CODEC.same(other, mattress(a))).toBe(false);
        },
      ),
    );
  });

  it("accepts both indexes and rejects any other", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer(),
        fc.integer(),
        fc.constantFrom<0 | 1>(0, 1),
        (x, y, z, index) => {
          expect(
            TENT_CELL_CODEC.isCell({ x, y, z, block: mattress(index) }),
          ).toBe(true);
        },
      ),
    );
    for (const block of [
      { type: "mattress", index: 2 },
      { type: "mattress", index: -1 },
      { type: "mattress", index: 0.5 },
      { type: "mattress" },
      { type: "mattress", index: "0" },
    ])
      expect(TENT_CELL_CODEC.isCell({ x: 0, y: 64, z: 0, block })).toBe(false);
  });

  it("reads a saved mattress cell back unchanged", () => {
    const saved = JSON.parse(
      '[{"x":3,"y":65,"z":-4,"block":{"type":"mattress","index":1}}]',
    );
    for (const cell of saved) {
      expect(TENT_CELL_CODEC.isCell(cell)).toBe(true);
      expect(TENT_CELL_CODEC.upgrade(cell)).toBe(cell);
    }
  });

  it("resolves a mattress with no states", () => {
    TENT_CELL_CODEC.permutationOf(mattress(0));
    expect(BlockPermutation.resolve).toHaveBeenLastCalledWith(
      TENT_MATTRESS_BLOCK,
    );
  });

  const pose: TentPose = { x: 0, y: 64, z: 0, yaw: 0 };
  const id = asTentId("tent-1");
  const mattressCells = tentCells(pose, PITCHED_STATE).filter(
    (c) => c.block.type === "mattress",
  );

  function fixture(savedCells: readonly LaidCell<TentBlock>[]) {
    const blocks = new Map<string, string>();
    const at = (c: Cell) => blocks.get(cellKey(c)) ?? "minecraft:air";
    const dimension = {
      id: "minecraft:overworld",
      getBlock: (c: Cell) => ({
        get typeId() {
          return at(c);
        },
        get isAir() {
          return at(c) === "minecraft:air";
        },
        setType: (typeId: string) => blocks.set(cellKey(c), typeId),
        setPermutation: (p: { id: string }) => blocks.set(cellKey(c), p.id),
      }),
    } as unknown as Dimension;
    const saved = new Map<string, unknown>([
      [TENT_CELL_CODEC.property, JSON.stringify(savedCells)],
    ]);
    const holder: CellHolder = {
      dimension,
      isValid: true,
      getDynamicProperty: (key) => saved.get(key) as string | undefined,
      setDynamicProperty: (key, value) => saved.set(key, value),
    };
    for (const c of savedCells)
      blocks.set(cellKey(c), TENT_CELL_CODEC.blockIdOf(c.block));
    const savedNow = () =>
      JSON.parse(
        String(saved.get(TENT_CELL_CODEC.property) ?? "[]"),
      ) as LaidCell<TentBlock>[];
    return { blocks, at, holder, savedNow, layer: createTentBlocks() };
  }

  it("places the mattresses of a tent saved without them on the next lay, around a player's block", () => {
    const before = tentCells(pose, PITCHED_STATE).filter(
      (c) => c.block.type !== "mattress",
    );
    const f = fixture(before);
    const [chest, ...free] = mattressCells;
    const taken = defined(chest, "mattress cell");
    f.blocks.set(cellKey(taken), "minecraft:chest");
    f.layer.lay(id, f.holder, tentCells(pose, PITCHED_STATE));
    for (const c of free) expect(f.at(c)).toBe(TENT_MATTRESS_BLOCK);
    expect(f.at(taken)).toBe("minecraft:chest");
    const savedMattresses = f
      .savedNow()
      .filter((c) => c.block.type === "mattress");
    expect(savedMattresses).toHaveLength(3);
    expect(savedMattresses.some((c) => cellKey(c) === cellKey(taken))).toBe(
      false,
    );
  });

  it("clears on take-down a mattress that is still its own, and keeps another block", () => {
    const f = fixture([]);
    f.layer.lay(id, f.holder, tentCells(pose, PITCHED_STATE));
    const [kept, ...cleared] = mattressCells;
    const replaced = defined(kept, "mattress cell");
    f.blocks.set(cellKey(replaced), "minecraft:stone");
    f.layer.lay(id, f.holder, []);
    for (const c of cleared) expect(f.at(c)).toBe("minecraft:air");
    expect(f.at(replaced)).toBe("minecraft:stone");
  });
});
