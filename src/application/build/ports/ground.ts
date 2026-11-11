import type { DimensionId } from "../../../domain/shared/ids";

export interface GroundProbe {
  topSolidY(
    dimensionId: DimensionId,
    x: number,
    z: number,
    fromY: number,
  ): number | undefined;
}
