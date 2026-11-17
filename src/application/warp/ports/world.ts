import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { BlockPresence } from "../../../domain/warp/presence";
import type { WarpPoint } from "../../../domain/warp/warpPoint";

export interface WarpWorld {
  presence(point: WarpPoint): BlockPresence;
  isStandable(dimension: DimensionId, feet: Cell): boolean;
  /** Preserves the player's facing. */
  teleport(playerId: PlayerId, dimension: DimensionId, feet: Cell): boolean;
}
