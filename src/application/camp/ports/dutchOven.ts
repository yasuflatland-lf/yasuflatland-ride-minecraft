import type { DutchOvenId } from "../../../domain/camp/dutchOven";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface DutchOvenWorld {
  isAir(dimension: DimensionId, at: Vec3): boolean;
  isOwnBlock(dimension: DimensionId, at: Vec3): boolean;
  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean;
  hasDutchOvenNear(dimension: DimensionId, at: Vec3): boolean;
  isCreative(player: PlayerId): boolean;
  consumeItem(player: PlayerId, slot: number): boolean;
  spawnDutchOven(dimension: DimensionId, at: Vec3, yaw: number): void;
  dropItem(id: DutchOvenId): void;
  removeDutchOven(id: DutchOvenId): void;
  showHitsLeft(player: PlayerId, hitsLeft: number): void;
}
