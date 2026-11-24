import type { DutchOvenId } from "../../../domain/camp/dutchOven";
import type { FirePitId } from "../../../domain/camp/firePit";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { TopHostWorld } from "../../shared/placeOnTop";
import type { HitsLeftFeedback } from "../../shared/ports/hitsLeft";

export interface DutchOvenWorld extends HitsLeftFeedback, TopHostWorld {
  hasDutchOvenNear(dimension: DimensionId, at: Vec3): boolean;
  spawnDutchOven(
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    setup?: (id: DutchOvenId) => void,
  ): DutchOvenId | undefined;
  firePit(
    id: FirePitId,
  ): { dimension: DimensionId; at: Vec3; yaw: number } | undefined;
  isCovered(id: FirePitId): boolean;
  setCovered(id: FirePitId, covered: boolean): void;
  simmering(id: DutchOvenId): boolean | undefined;
  setSimmering(id: DutchOvenId, value: boolean): void;
  host(id: DutchOvenId): string;
  setHost(id: DutchOvenId, host: string, simmering: boolean): void;
  loadedOvens(): readonly DutchOvenId[];
  loadedFirePits(): readonly FirePitId[];
  hostExists(id: string): boolean;
  isHostAreaLoaded(id: DutchOvenId): boolean;
  dropItem(id: DutchOvenId, hitter?: PlayerId): void;
  removeDutchOven(id: DutchOvenId): void;
}
