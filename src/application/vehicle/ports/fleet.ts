import type { VehicleId } from "../../../domain/shared/ids";
// Ports for removing vehicles from the fleet; implemented in the infrastructure layer (ADR 0012).
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";

export interface BreakWorld {
  dropVehicleItem(vehicleId: VehicleId): void;
  removeVehicle(vehicleId: VehicleId): void;
}

export interface LimitWorld {
  /** Vehicles in loaded chunks, in every dimension. */
  loadedFleetEntries(): FleetEntry[];
  removeVehicle(vehicleId: VehicleId): void;
}
