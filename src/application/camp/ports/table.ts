import type { TableId } from "../../../domain/camp/table";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface TableWorld {
  ovensOnTable(id: TableId): number;
  showOvenOnTop(player: PlayerId): void;
  isAir(dimensionId: DimensionId, at: Vec3): boolean;
  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean;
  isVehicleSpace(dimensionId: DimensionId, at: Vec3): boolean;
  hasTableNear(dimensionId: DimensionId, at: Vec3): boolean;
  isCreative(playerId: PlayerId): boolean;
  consumeItem(playerId: PlayerId, slot: number): boolean;
  spawnTable(dimensionId: DimensionId, at: Vec3, yaw: number): void;
  isOccupied(tableId: TableId): boolean;
  dropItem(tableId: TableId): void;
  removeTable(tableId: TableId): void;
  showHitsLeft(playerId: PlayerId, hitsLeft: number): void;
}
