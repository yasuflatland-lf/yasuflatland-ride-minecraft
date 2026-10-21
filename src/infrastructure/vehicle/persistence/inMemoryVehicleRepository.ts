import type { VehicleId } from "../../../domain/shared/ids";
// Aggregates live only in memory. They are lost when the script reloads, and DriveVehicles rebuilds them (ADR 0012).
import type { Vehicle } from "../../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";

export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly vehicles = new Map<VehicleId, Vehicle>();
  get(id: VehicleId): Vehicle | undefined {
    return this.vehicles.get(id);
  }
  save(vehicle: Vehicle): void {
    this.vehicles.set(vehicle.id, vehicle);
  }
  remove(id: VehicleId): void {
    this.vehicles.delete(id);
  }
  ids(): VehicleId[] {
    return [...this.vehicles.keys()];
  }
}
