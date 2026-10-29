import type { GasLanternId } from "../../../domain/camp/gasLantern";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { GroundCellsWorld } from "./groundCells";

export interface GasLanternWorld extends GroundCellsWorld {
  hasGasLanternNear(dimension: DimensionId, at: Vec3): boolean;
  spawnGasLantern(dimension: DimensionId, at: Vec3, yaw: number): void;
  isLit(id: GasLanternId): boolean | undefined;
  setLit(id: GasLanternId, on: boolean): void;
  relayLight(id: GasLanternId, lit: boolean): void;
  clearLight(id: GasLanternId): void;
  dropItem(id: GasLanternId): void;
  removeGasLantern(id: GasLanternId): void;
  showHitsLeft(player: PlayerId, hitsLeft: number): void;
}
