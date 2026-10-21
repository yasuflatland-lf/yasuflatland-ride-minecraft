import type { VehicleId } from "../../domain/shared/ids";
// Use case: open or close a held vehicle's shower door, whatever was tapped (ADR 0094).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";

export interface UseShowerDoorCommand {
  vehicleId: VehicleId;
}

export class UseShowerDoor {
  constructor(private readonly repo: VehicleRepository) {}

  /** Returns whether the shower door opened or closed. */
  execute(cmd: UseShowerDoorCommand): boolean {
    return this.repo.get(cmd.vehicleId)?.useShowerDoor() ?? false;
  }
}
