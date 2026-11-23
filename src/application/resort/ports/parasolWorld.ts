import type { ParasolId } from "../../../domain/resort/ids";
import type { ParasolPose } from "../../../domain/resort/parasolPose";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { GroundCellsWorld } from "../../shared/ports/groundCells";
import type { HitsLeftFeedback } from "../../shared/ports/hitsLeft";
import type { ItemPayment } from "../../shared/ports/itemPayment";

export interface ParasolWorld extends GroundCellsWorld, ItemPayment {
  isSolidTop(dimension: DimensionId, cell: Cell): boolean;
  isCampSpace(dimension: DimensionId, cell: Cell): boolean;
  baseCellsNear(dimension: DimensionId, at: Cell, radius: number): Cell[];
  spawn(dimension: DimensionId, pose: ParasolPose): ParasolId | undefined;
  showBlocked(player: PlayerId): void;
  layCeiling(id: ParasolId): void;
}
export interface ParasolTakeBackWorld extends HitsLeftFeedback {
  dropItem(id: ParasolId, player: PlayerId | undefined): void;
  remove(id: ParasolId): void;
  clearCeiling(id: ParasolId): void;
  showTaken(player: PlayerId): void;
}
