import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export interface WarpBlockTapEffects {
  drop(): void;
  remove(): void;
  showRemaining(left: number): void;
}

export interface WarpBlockTaps {
  /** Returns effects only while the player and warp block are still present. */
  at(
    playerId: PlayerId,
    dimension: DimensionId,
    cell: Cell,
  ): WarpBlockTapEffects | undefined;
}
