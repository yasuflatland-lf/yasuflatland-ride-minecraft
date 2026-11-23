import type {
  FurnitureKind,
  FurniturePose,
} from "../../../domain/resort/furniture";
import type { FurnitureId } from "../../../domain/resort/ids";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { GroundCellsWorld } from "../../shared/ports/groundCells";
import type { HitsLeftFeedback } from "../../shared/ports/hitsLeft";
import type { ItemPayment } from "../../shared/ports/itemPayment";

import type { FurnitureTopBlocksWorld } from "./furnitureTopBlocks";

export interface FurnitureWorld
  extends GroundCellsWorld,
    Pick<ItemPayment, "isCreative">,
    Pick<FurnitureTopBlocksWorld, "layTop"> {
  isCampSpace(dimension: DimensionId, cell: Cell): boolean;
  isSolidTop(dimension: DimensionId, cell: Cell): boolean;
  spawn(dimension: DimensionId, pose: FurniturePose): FurnitureId | undefined;
  refund(player: PlayerId, kind: FurnitureKind, slot: number): void;
  consumeItem(player: PlayerId, kind: FurnitureKind, slot: number): boolean;
  showBlocked(player: PlayerId): void;
}
export interface FurnitureTakeBackWorld
  extends HitsLeftFeedback,
    Pick<FurnitureTopBlocksWorld, "clearTop" | "blockAboveTop"> {
  kindOf(id: FurnitureId): FurnitureKind | undefined;
  isOccupied(id: FurnitureId): boolean;
  somethingOnTop(id: FurnitureId): boolean;
  dropItem(id: FurnitureId, player: PlayerId): void;
  remove(id: FurnitureId): void;
  showRefused(player: PlayerId, reason: "occupied" | "somethingOnTop"): void;
  showTaken(player: PlayerId): void;
}
