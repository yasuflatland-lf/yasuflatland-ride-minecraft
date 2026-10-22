// Port for placing, sitting on, and taking back the low chair; implemented in the infrastructure layer (ADR 0012, 0122).
import type { ChairId } from "../../../domain/camp/chair";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";

export interface ChairWorld {
  isAir(dimensionId: DimensionId, at: Vec3): boolean;
  /** Whether a vehicle stands on `cell` or laid its room blocks there or in the block under it. */
  isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean;
  /** Whether the block at `at` is one of this add-on's blocks, such as a camper's room block. */
  isOwnBlock(dimensionId: DimensionId, at: Vec3): boolean;
  /** Whether a low chair already stands in `cell`. */
  hasChairAt(dimensionId: DimensionId, cell: Vec3): boolean;
  /** Whether the player is in Creative; false when the player is not in the world. */
  isCreative(playerId: PlayerId): boolean;
  /** Takes one chair item from `slot`. False when that slot no longer holds one. */
  consumeChairItem(playerId: PlayerId, slot: number): boolean;
  spawnChair(dimensionId: DimensionId, at: Vec3, yaw: number): void;
  /** Whether someone sits on the chair. */
  isOccupied(chairId: ChairId): boolean;
  removeChair(chairId: ChairId): void;
  /** Drops one chair item where the chair stands. */
  dropChairItem(chairId: ChairId): void;
  /** Tells the player how many more hits take the chair back. */
  showHitsLeft(playerId: PlayerId, hitsLeft: number): void;
}
