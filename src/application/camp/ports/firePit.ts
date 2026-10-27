import type { FirePitId } from "../../../domain/camp/firePit";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface FirePitWorld {
  isAir(dimension: DimensionId, at: Vec3): boolean;
  isOwnBlock(dimension: DimensionId, at: Vec3): boolean;
  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean;
  hasFirePitNear(dimension: DimensionId, at: Vec3): boolean;
  isCreative(player: PlayerId): boolean;
  consumeItem(player: PlayerId, slot: number): boolean;
  spawnFirePit(dimension: DimensionId, at: Vec3, yaw: number): void;
  isCovered(id: FirePitId): boolean;
  setCovered(id: FirePitId, covered: boolean): void;
  showCoveredHint(player: PlayerId): void;
  isLit(id: FirePitId): boolean;
  setLit(id: FirePitId, lit: boolean): void;
  wearFlintAndSteel(player: PlayerId, slot: number): void;
  dropItem(id: FirePitId): void;
  removeFirePit(id: FirePitId): void;
  showHitsLeft(player: PlayerId, hitsLeft: number): void;
}
