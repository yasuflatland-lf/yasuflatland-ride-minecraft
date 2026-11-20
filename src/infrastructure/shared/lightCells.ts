import { BlockPermutation } from "@minecraft/server";
import type { LaidCell, LightLevel } from "../../domain/shared/laidCells";
import type { CellCodec } from "./laidCells";
import { lightBlockId } from "./lightBlocks";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Codec for light cells saved on `property`. `upgrade` rewrites an older saved shape. */
export function lightCellCodec(
  property: string,
  upgrade: (saved: unknown) => unknown = (saved) => saved,
): CellCodec<LightLevel> {
  return {
    property,
    upgrade,
    isCell: (v): v is LaidCell<LightLevel> =>
      isRecord(v) &&
      Number.isInteger(v.x) &&
      Number.isInteger(v.y) &&
      Number.isInteger(v.z) &&
      isRecord(v.block) &&
      typeof v.block.level === "number" &&
      Number.isInteger(v.block.level) &&
      v.block.level >= 0 &&
      v.block.level <= 15,
    same: (a, b) => a.level === b.level,
    blockIdOf: ({ level }) => lightBlockId(level),
    permutationOf: ({ level }) => BlockPermutation.resolve(lightBlockId(level)),
  };
}
