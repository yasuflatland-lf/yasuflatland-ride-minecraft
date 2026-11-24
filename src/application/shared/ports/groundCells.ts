import type { DimensionId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface GroundCellsWorld {
  isAir(dimension: DimensionId, at: Vec3): boolean;
  isOwnBlock(dimension: DimensionId, at: Vec3): boolean;
  isCampSpace?(dimension: DimensionId, at: Vec3): boolean;
  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean;
}
