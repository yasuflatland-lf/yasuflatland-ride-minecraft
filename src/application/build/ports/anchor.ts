import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface BuildAnchor {
  feetOf(
    playerId: PlayerId,
  ): { dimensionId: DimensionId; cell: Cell } | undefined;
}
