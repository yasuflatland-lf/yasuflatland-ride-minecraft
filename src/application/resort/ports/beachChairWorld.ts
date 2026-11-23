import type {
  BeachChairPose,
  ChairState,
} from "../../../domain/resort/beachChair";
import type { BeachChairId } from "../../../domain/resort/ids";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { GroundCellsWorld } from "../../shared/ports/groundCells";
import type { HitsLeftFeedback } from "../../shared/ports/hitsLeft";
import type { ItemPayment } from "../../shared/ports/itemPayment";

export interface BeachChairWorld extends GroundCellsWorld, ItemPayment {
  isSolidTop(dimension: DimensionId, cell: Cell): boolean;
  isCampSpace(dimension: DimensionId, cell: Cell): boolean;
  resortGearCells(dimension: DimensionId, near: Vec3, radius: number): Cell[];
  spawn(dimension: DimensionId, pose: BeachChairPose): BeachChairId | undefined;
  showBlocked(player: PlayerId): void;
}
export interface BeachChairTakeBackWorld extends HitsLeftFeedback {
  state(id: BeachChairId): ChairState | undefined;
  showRefused(player: PlayerId, reason: "occupied" | "somethingOnTop"): void;
  dropItem(id: BeachChairId, player: PlayerId | undefined): void;
  remove(id: BeachChairId): void;
  showTaken(player: PlayerId): void;
}
