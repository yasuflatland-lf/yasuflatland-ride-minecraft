import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";

export type TapTargetPlacement = Readonly<{
  dimensionId: DimensionId;
  cell: Cell;
}>;

export interface TapTargets {
  /** Creates or moves the player's single target. */
  show(playerId: PlayerId, at: TapTargetPlacement): void;
  hide(playerId: PlayerId): void;
}
