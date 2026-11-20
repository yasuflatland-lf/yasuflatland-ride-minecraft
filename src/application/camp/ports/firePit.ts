import type { FirePitId } from "../../../domain/camp/firePit";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { GroundCellsWorld } from "../../shared/ports/groundCells";
import type { HitsLeftFeedback } from "../../shared/ports/hitsLeft";

export interface FirePitWorld extends HitsLeftFeedback, GroundCellsWorld {
  hasFirePitNear(dimension: DimensionId, at: Vec3): boolean;
  spawnFirePit(dimension: DimensionId, at: Vec3, yaw: number): void;
  isCovered(id: FirePitId): boolean;
  setCovered(id: FirePitId, covered: boolean): void;
  showCoveredHint(player: PlayerId): void;
  isLit(id: FirePitId): boolean;
  setLit(id: FirePitId, lit: boolean): void;
  wearFlintAndSteel(player: PlayerId, slot: number): void;
  dropItem(id: FirePitId): void;
  removeFirePit(id: FirePitId): void;
}
