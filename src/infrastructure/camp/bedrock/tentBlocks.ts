// The tent's laid wall, flap, ceiling, and mattress cells, saved on its entity (ADR 0131, 0132, 0133).
import { BlockPermutation } from "@minecraft/server";
import { isFlapId } from "../../../domain/camp/flaps";
import { TENT_SPEC } from "../../../domain/camp/spec";
import type { TentBlock, TentId } from "../../../domain/camp/tent";
import type { LaidCell } from "../../../domain/shared/laidCells";
import { type CellCodec, CellLayer } from "../../shared/laidCells";
import {
  TENT_CEILING_BLOCK,
  TENT_CELLS_PROPERTY,
  TENT_FACE_STATE,
  TENT_FLAP_BLOCK,
  TENT_MATTRESS_BLOCK,
  TENT_OPEN_STATE,
  TENT_WALL_BLOCK,
} from "../identifiers";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function isTentBlock(v: unknown): v is TentBlock {
  if (!isRecord(v)) return false;
  if (v.type === "ceiling") return true;
  if (v.type === "flap") return isFlapId(v.id) && typeof v.open === "boolean";
  if (v.type === "mattress") return v.index === 0 || v.index === 1;
  return (
    v.type === "wall" &&
    typeof v.face === "number" &&
    [0, 1, 2, 3].includes(v.face)
  );
}

export const TENT_CELL_CODEC: CellCodec<TentBlock> = {
  property: TENT_CELLS_PROPERTY,
  // No older shape exists yet.
  upgrade: (saved) => saved,
  isCell: (v): v is LaidCell<TentBlock> =>
    isRecord(v) &&
    Number.isInteger(v.x) &&
    Number.isInteger(v.y) &&
    Number.isInteger(v.z) &&
    isTentBlock(v.block),
  same: (a, b) => {
    switch (a.type) {
      case "wall":
        return b.type === "wall" && a.face === b.face;
      case "flap":
        return b.type === "flap" && a.id === b.id && a.open === b.open;
      case "mattress":
        return b.type === "mattress" && a.index === b.index;
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
    }
  },
  permutationOf: (block) => {
    switch (block.type) {
      case "wall":
        return BlockPermutation.resolve(TENT_WALL_BLOCK, {
          [TENT_FACE_STATE]: block.face,
        });
      case "flap":
        return BlockPermutation.resolve(TENT_FLAP_BLOCK, {
          [TENT_OPEN_STATE]: block.open,
        });
      case "ceiling":
        return BlockPermutation.resolve(TENT_CEILING_BLOCK);
      case "mattress":
        return BlockPermutation.resolve(TENT_MATTRESS_BLOCK);
    }
  },
};

export function createTentBlocks(): CellLayer<TentId, TentBlock> {
  return new CellLayer<TentId, TentBlock>(
    TENT_CELL_CODEC,
    TENT_SPEC.cellRecheckTicks,
  );
}
