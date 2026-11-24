// The tent's laid wall, flap, ceiling, mattress, and lantern cells, saved on
// its entity (ADR 0131, 0132, 0133, 0134).
import { BlockPermutation } from "@minecraft/server";
import { isFlapId } from "../../../domain/camp/flaps";
import { TENT_SPEC } from "../../../domain/camp/spec";
import type {
  TentBlock,
  TentId,
  TentPlateSide,
} from "../../../domain/camp/tent";
import { parseCell } from "../../../domain/shared/cells";
import type { LaidCell } from "../../../domain/shared/laidCells";
import { type CellCodec, CellLayer } from "../../shared/laidCells";
import {
  TENT_CEILING_BLOCK,
  TENT_CELLS_PROPERTY,
  TENT_FACE_STATE,
  TENT_FLAP_BLOCK,
  TENT_LANTERN_BLOCK,
  TENT_LIT_STATE,
  TENT_MATTRESS_BLOCK,
  TENT_OPEN_STATE,
  TENT_WALL_BLOCK,
} from "../identifiers";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const SIDES: readonly TentPlateSide[] = ["-z", "+z", "-x", "+x"];

function isTentBlock(v: unknown): v is TentBlock {
  if (!isRecord(v)) return false;
  if (v.type === "ceiling") return true;
  if (v.type === "flap") return isFlapId(v.id) && typeof v.open === "boolean";
  if (v.type === "mattress") return v.index === 0 || v.index === 1;
  if (v.type === "lantern") return typeof v.lit === "boolean";
  return (
    v.type === "wall" &&
    typeof v.face === "string" &&
    SIDES.includes(v.face as TentPlateSide)
  );
}

export const TENT_CELL_CODEC: CellCodec<TentBlock> = {
  property: TENT_CELLS_PROPERTY,
  upgrade: (saved) => {
    if (
      !isRecord(saved) ||
      !isRecord(saved.block) ||
      saved.block.type !== "wall"
    )
      return saved;
    const face = saved.block.face;
    if (
      typeof face !== "number" ||
      !Number.isInteger(face) ||
      face < 0 ||
      face >= SIDES.length
    )
      return saved;
    return { ...saved, block: { ...saved.block, face: SIDES[face] } };
  },
  encode: (cell) =>
    cell.block.type === "wall"
      ? {
          ...cell,
          block: { ...cell.block, face: SIDES.indexOf(cell.block.face) },
        }
      : cell,
  isCell: (v): v is LaidCell<TentBlock> =>
    isRecord(v) && parseCell(v) !== undefined && isTentBlock(v.block),
  same: (a, b) => {
    switch (a.type) {
      case "wall":
        return b.type === "wall" && a.face === b.face;
      case "flap":
        return b.type === "flap" && a.id === b.id && a.open === b.open;
      case "mattress":
        return b.type === "mattress" && a.index === b.index;
      case "lantern":
        return b.type === "lantern" && a.lit === b.lit;
      case "ceiling":
        return b.type === "ceiling";
    }
  },
  blockIdOf: (block) => {
    switch (block.type) {
      case "wall":
        return TENT_WALL_BLOCK;
      case "flap":
        return TENT_FLAP_BLOCK;
      case "ceiling":
        return TENT_CEILING_BLOCK;
      case "mattress":
        return TENT_MATTRESS_BLOCK;
      case "lantern":
        return TENT_LANTERN_BLOCK;
    }
  },
  permutationOf: (block) => {
    switch (block.type) {
      case "wall":
        return BlockPermutation.resolve(TENT_WALL_BLOCK, {
          [TENT_FACE_STATE]: SIDES.indexOf(block.face),
        });
      case "flap":
        return BlockPermutation.resolve(TENT_FLAP_BLOCK, {
          [TENT_OPEN_STATE]: block.open,
        });
      case "ceiling":
        return BlockPermutation.resolve(TENT_CEILING_BLOCK);
      case "mattress":
        return BlockPermutation.resolve(TENT_MATTRESS_BLOCK);
      case "lantern":
        return BlockPermutation.resolve(TENT_LANTERN_BLOCK, {
          [TENT_LIT_STATE]: block.lit,
        });
    }
  },
};

export function createTentBlocks(): CellLayer<TentId, TentBlock> {
  return new CellLayer<TentId, TentBlock>(
    TENT_CELL_CODEC,
    TENT_SPEC.cellRecheckTicks,
  );
}
