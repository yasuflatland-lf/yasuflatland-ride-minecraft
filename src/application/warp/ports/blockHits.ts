import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { TakeBackEffects } from "../../shared/takeBackByHits";

export interface WarpBlockHits {
  /** Returns effects only while the player and warp block are still present. */
  at(
    playerId: PlayerId,
    dimension: DimensionId,
    cell: Cell,
  ): TakeBackEffects | undefined;
}
