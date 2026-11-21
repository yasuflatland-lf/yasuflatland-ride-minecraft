import type { AimSample } from "../../../domain/build/aim/sample";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface AimReader {
  dimensionOf(playerId: PlayerId): DimensionId | undefined;
  aim(playerId: PlayerId): AimSample | undefined;
}

export type AimResult = AimSample;
