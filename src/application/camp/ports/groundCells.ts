import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface GroundCellsWorld {
  isAir(dimension: DimensionId, at: Vec3): boolean;
  isOwnBlock(dimension: DimensionId, at: Vec3): boolean;
  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean;
  isCreative(player: PlayerId): boolean;
  consumeItem(player: PlayerId, slot: number): boolean;
}
