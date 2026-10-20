import type { VehicleId } from "../../../domain/shared/ids";
// Ports for switching a vehicle's headlights; implemented in the infrastructure layer (ADR 0012).

export interface HeadlightWorld {
  /** undefined when the vehicle no longer exists. */
  headlightsOn(vehicleId: VehicleId): boolean | undefined;
  setHeadlights(vehicleId: VehicleId, on: boolean): void;
}
