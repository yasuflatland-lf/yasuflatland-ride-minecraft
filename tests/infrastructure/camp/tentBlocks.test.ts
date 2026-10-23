import { BlockPermutation } from "@minecraft/server";
import { describe, expect, it, vi } from "vitest";
import type { TentBlock } from "../../../src/domain/camp/tent";
import { TENT_CELL_CODEC } from "../../../src/infrastructure/camp/bedrock/tentBlocks";
import {
  TENT_CEILING_BLOCK,
  TENT_FACE_STATE,
  TENT_WALL_BLOCK,
} from "../../../src/infrastructure/camp/identifiers";
import { savedLaidCells } from "../../../src/infrastructure/shared/laidCells";

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
});
