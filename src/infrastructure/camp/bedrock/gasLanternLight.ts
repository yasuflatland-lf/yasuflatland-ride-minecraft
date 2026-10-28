import { BlockPermutation } from "@minecraft/server";
import type {
  GasLanternId,
  GasLanternLight,
} from "../../../domain/camp/gasLantern";
import type { LaidCell } from "../../../domain/shared/laidCells";
import { type CellCodec, CellLayer } from "../../shared/laidCells";
import { lightBlockId } from "../../shared/lightBlocks";
import { GAS_LANTERN_CELLS_PROPERTY } from "../identifiers";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export const GAS_LANTERN_CELL_CODEC: CellCodec<GasLanternLight> = {
  property: GAS_LANTERN_CELLS_PROPERTY,
  // No older shape exists yet.
  upgrade: (saved) => saved,
  isCell: (v): v is LaidCell<GasLanternLight> =>
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

export function createGasLanternLight(): CellLayer<
  GasLanternId,
  GasLanternLight
> {
  // Re-read the single cell on every lay to repair lost or shared light promptly.
  return new CellLayer<GasLanternId, GasLanternLight>(
    GAS_LANTERN_CELL_CODEC,
    1,
  );
}
