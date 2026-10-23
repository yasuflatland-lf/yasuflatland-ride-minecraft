import type {
  DimensionId,
  PlayerId,
  VehicleId,
} from "../../../domain/shared/ids";
// Ports for placing a vehicle and handing out the starter item; implemented in the infrastructure layer (ADR 0012).
import type { Vec3 } from "../../../domain/shared/vec";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import type { PlacementGift } from "../../../domain/vehicle/placement/gift";
import type { StarterKind } from "../../../domain/vehicle/placement/starter";

export interface PlacementWorld {
  /** Whether another feature holds `at`, such as a pitched tent's cell (ADR 0129). */
  isCampSpace(dimensionId: DimensionId, at: Vec3): boolean;
  isAir(dimensionId: DimensionId, at: Vec3): boolean;
  /** Whether the block cell at `at` holds water, including a waterlogged block. False for an unloaded cell or an unknown dimension. */
  isWaterAt(dimensionId: DimensionId, at: Vec3): boolean;
  spawnVehicle(
    dimensionId: DimensionId,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: PlayerId,
  ): VehicleId;
  /** Takes one vehicle item from `slot`. False when that slot no longer holds one. */
  consumeVehicleItem(
    playerId: PlayerId,
    slot: number,
    kind: VehicleKind,
  ): boolean;
  /** Whether the player is in creative mode; false when the player is not in the world. */
  isCreative(playerId: PlayerId): boolean;
  /** Whether the player has received `gift`; undefined when the player is no longer in the world. */
  receivedGift(playerId: PlayerId, gift: PlacementGift): boolean | undefined;
  /** Puts one `gift` item in the inventory, or at the player's feet when it is full. */
  giveGift(playerId: PlayerId, gift: PlacementGift): void;
  markGiftReceived(playerId: PlayerId, gift: PlacementGift): void;
}

export interface StarterWorld {
  /** Whether the player has received `kind`'s starter item; undefined when the player is no longer in the world. */
  receivedStarter(playerId: PlayerId, kind: StarterKind): boolean | undefined;
  /** Puts one item of this kind in the inventory, or at the player's feet when it is full. */
  giveVehicleItem(playerId: PlayerId, kind: VehicleKind): void;
  markStarterReceived(playerId: PlayerId, kind: StarterKind): void;
}

export interface GiftBoxWorld {
  /** Takes one `gift` box from `slot`. False when that slot no longer holds one. */
  consumeGift(playerId: PlayerId, gift: PlacementGift, slot: number): boolean;
  /**
   * Puts every item `gift` holds in the inventory, each with the gift's lore line;
   * what does not fit drops at the player's feet.
   */
  unpackGift(playerId: PlayerId, gift: PlacementGift): void;
}
