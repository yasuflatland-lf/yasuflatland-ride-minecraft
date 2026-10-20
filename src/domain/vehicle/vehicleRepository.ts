import type { VehicleId } from "../shared/ids";
import type { Vehicle } from "./vehicle";

export interface VehicleRepository {
  get(id: VehicleId): Vehicle | undefined;
  save(vehicle: Vehicle): void;
  remove(id: VehicleId): void;
  ids(): VehicleId[];
}
