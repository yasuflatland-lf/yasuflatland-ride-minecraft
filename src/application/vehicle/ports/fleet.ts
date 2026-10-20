// Ports for removing vehicles from the fleet; implemented in the infrastructure layer (ADR 0012).
import type { FleetEntry } from "../../../domain/vehicle/fleet/fleet";

export interface BreakWorld {
  dropVehicleItem(vehicleId: string): void;
  removeVehicle(vehicleId: string): void;
}

export interface LimitWorld {
  /** Vehicles in loaded chunks, in every dimension. */
  loadedFleetEntries(): FleetEntry[];
  removeVehicle(vehicleId: string): void;
}
