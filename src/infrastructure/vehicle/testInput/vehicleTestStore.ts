import type { VehicleId } from "../../../domain/shared/ids";

export class VehicleTestStore<T> {
  private readonly values = new Map<VehicleId, T>();

  set(vehicleId: VehicleId, value: T): void {
    this.values.set(vehicleId, value);
  }

  clear(vehicleId: VehicleId): void {
    this.values.delete(vehicleId);
  }

  get(vehicleId: VehicleId): T | undefined {
    return this.values.get(vehicleId);
  }

  retain(ids: ReadonlySet<VehicleId>): void {
    for (const id of this.values.keys()) {
      if (!ids.has(id)) this.values.delete(id);
    }
  }
}
