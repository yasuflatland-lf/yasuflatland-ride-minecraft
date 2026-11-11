import type { DimensionId } from "../../../domain/shared/ids";

export interface GroundProbe {
  // Scans fromY down to toY, both inclusive.
  topSolidY(
    dimensionId: DimensionId,
    x: number,
    z: number,
    fromY: number,
    toY: number,
  ): number | undefined;
}
