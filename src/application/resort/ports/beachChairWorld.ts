import type {
  BeachChairPose,
  ChairState,
} from "../../../domain/resort/beachChair";
import type { BeachChairId } from "../../../domain/resort/ids";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { GroundCellsWorld } from "../../shared/ports/groundCells";

export interface BeachChairWorld extends GroundCellsWorld {
  isSolidTop(dimension: DimensionId, cell: Cell): boolean;
  isCampSpace(dimension: DimensionId, cell: Cell): boolean;
  spawn(dimension: DimensionId, pose: BeachChairPose): BeachChairId | undefined;
  refund(player: PlayerId, slot: number): void;
  showBlocked(player: PlayerId): void;
}
export interface BeachChairTakeBackWorld {
  state(id: BeachChairId): ChairState | undefined;
  showRefused(player: PlayerId, reason: "occupied" | "somethingOnTop"): void;
  dropItem(id: BeachChairId, player: PlayerId | undefined): void;
  remove(id: BeachChairId): void;
  showRemaining(player: PlayerId, left: number): void;
  showTaken(player: PlayerId): void;
}
