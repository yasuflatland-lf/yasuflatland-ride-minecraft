import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId } from "../../../domain/shared/ids";

export interface GroundCellsWorld {
  isAir(dimension: DimensionId, at: Cell): boolean;
  isOwnBlock(dimension: DimensionId, at: Cell): boolean;
  isCampSpace?(dimension: DimensionId, at: Cell): boolean;
  isVehicleSpace(dimension: DimensionId, at: Cell): boolean;
}
