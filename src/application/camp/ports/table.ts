import type { TableId } from "../../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { GroundCellsWorld } from "./groundCells";

export interface TableWorld extends GroundCellsWorld {
  ovensOnTable(id: TableId): number;
  showOvenOnTop(player: PlayerId): void;
  hasTableNear(dimensionId: DimensionId, at: Vec3): boolean;
  spawnTable(dimensionId: DimensionId, at: Vec3, yaw: number): void;
  isOccupied(tableId: TableId): boolean;
  dropItem(tableId: TableId): void;
  removeTable(tableId: TableId): void;
  showHitsLeft(playerId: PlayerId, hitsLeft: number): void;
}
