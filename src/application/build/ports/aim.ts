import type { Ray } from "../../../domain/build/aim/aim";
import type { Face } from "../../../domain/build/aim/face";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface AimReader {
  dimensionOf(playerId: PlayerId): DimensionId | undefined;
  aim(
    playerId: PlayerId,
  ): { ray: Ray; block?: { cell: Cell; face: Face } } | undefined;
}

export type AimResult = NonNullable<ReturnType<AimReader["aim"]>>;
