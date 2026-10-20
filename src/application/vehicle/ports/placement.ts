// Ports for placing a vehicle and handing out the starter item; implemented in the infrastructure layer (ADR 0012).
import type { Vec3 } from "../../../domain/shared/vec";
import type { VehicleKind } from "../../../domain/vehicle/kind";

export interface PlacementWorld {
  isAir(dimensionId: string, at: Vec3): boolean;
  /** Whether the block cell at `at` holds water, including a waterlogged block. False for an unloaded cell or an unknown dimension. */
  isWaterAt(dimensionId: string, at: Vec3): boolean;
  spawnVehicle(
    dimensionId: string,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: string,
  ): string;
  /** Takes one vehicle item from `slot`. False when that slot no longer holds one. */
  consumeVehicleItem(
    playerId: string,
    slot: number,
    kind: VehicleKind,
  ): boolean;
  /** Whether the player is in creative mode; false when the player is not in the world. */
  isCreative(playerId: string): boolean;
}

export interface StarterWorld {
  /** undefined when the player is no longer in the world. */
  receivedStarter(playerId: string): boolean | undefined;
  /** Puts one item of this kind in the inventory, or at the player's feet when it is full. */
  giveVehicleItem(playerId: string, kind: VehicleKind): void;
  markStarterReceived(playerId: string): void;
}
