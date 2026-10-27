import type { DutchOvenId } from "../../../domain/camp/dutchOven";
import type { FirePitId } from "../../../domain/camp/firePit";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface DutchOvenWorld {
  isAir(dimension: DimensionId, at: Vec3): boolean;
  isOwnBlock(dimension: DimensionId, at: Vec3): boolean;
  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean;
  hasDutchOvenNear(dimension: DimensionId, at: Vec3): boolean;
  isCreative(player: PlayerId): boolean;
  consumeItem(player: PlayerId, slot: number): boolean;
  spawnDutchOven(dimension: DimensionId, at: Vec3, yaw: number): DutchOvenId;
  firePit(
    id: FirePitId,
  ): { dimension: DimensionId; at: Vec3; yaw: number } | undefined;
  isCovered(id: FirePitId): boolean;
  setCovered(id: FirePitId, covered: boolean): void;
  host(id: DutchOvenId): string;
  setHost(id: DutchOvenId, host: string, simmering: boolean): void;
  loadedOvens(): readonly DutchOvenId[];
  loadedFirePits(): readonly FirePitId[];
  hostExists(id: string): boolean;
  isHostAreaLoaded(id: DutchOvenId): boolean;
  dropItem(id: DutchOvenId): void;
  removeDutchOven(id: DutchOvenId): void;
  showHitsLeft(player: PlayerId, hitsLeft: number): void;
}
