import type {
  GasLanternId,
  GasLanternLight,
} from "../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../domain/camp/spec";
import { CellLayer } from "../../shared/laidCells";
import { lightCellCodec } from "../../shared/lightCells";
import { GAS_LANTERN_CELLS_PROPERTY } from "../identifiers";

export function createGasLanternLight(): CellLayer<
  GasLanternId,
  GasLanternLight
> {
  return new CellLayer<GasLanternId, GasLanternLight>(
    lightCellCodec(GAS_LANTERN_CELLS_PROPERTY),
    GAS_LANTERN_SPEC.cellRecheckTicks,
  );
}
