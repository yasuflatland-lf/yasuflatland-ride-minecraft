import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface BuildPlayers {
  /** Feet cell; undefined when absent or riding. */
  occupantOf(
    playerId: PlayerId,
  ): { dimensionId: DimensionId; feet: Cell } | undefined;
  moveTo(playerId: PlayerId, cell: Cell): void;
}
