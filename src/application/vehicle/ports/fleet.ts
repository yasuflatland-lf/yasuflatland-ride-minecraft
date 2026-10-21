import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
// Ports for removing vehicles from the fleet; implemented in the infrastructure layer (ADR 0012).
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";

export interface BreakWorld {
  dropVehicleItem(vehicleId: VehicleId): void;
  /** Puts one of each item (camping gear ids) into the player's inventory and drops what does not fit at the player's feet (ADR 0093). */
  giveDecorItems(playerId: PlayerId, items: readonly string[]): void;
  removeVehicle(vehicleId: VehicleId): void;
}

export interface LimitWorld {
  /** Vehicles in loaded chunks, in every dimension. */
  loadedFleetEntries(): FleetEntry[];
  removeVehicle(vehicleId: VehicleId): void;
}
