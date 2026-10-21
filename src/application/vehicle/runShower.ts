import type { VehicleId } from "../../domain/shared/ids";
// Use case: run a held vehicle's shower, whatever was tapped (ADR 0094).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";

export interface RunShowerCommand {
  vehicleId: VehicleId;
}

export class RunShower {
  constructor(private readonly repo: VehicleRepository) {}

  /** Returns whether the shower runs. */
  execute(cmd: RunShowerCommand): boolean {
    return this.repo.get(cmd.vehicleId)?.runShower() ?? false;
  }
}
