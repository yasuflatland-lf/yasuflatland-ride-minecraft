import type { VehicleId } from "../../../domain/shared/ids";
import type { RawInput } from "../../../domain/vehicle/driveInput";

export class TestInputStore {
  private readonly inputs = new Map<VehicleId, RawInput>();

  set(vehicleId: VehicleId, input: RawInput): void {
    this.inputs.set(vehicleId, input);
  }

  clear(vehicleId: VehicleId): void {
    this.inputs.delete(vehicleId);
  }

  get(vehicleId: VehicleId): RawInput | undefined {
    return this.inputs.get(vehicleId);
  }

  retain(ids: ReadonlySet<VehicleId>): void {
    for (const id of this.inputs.keys()) {
      if (!ids.has(id)) this.inputs.delete(id);
    }
  }
}
