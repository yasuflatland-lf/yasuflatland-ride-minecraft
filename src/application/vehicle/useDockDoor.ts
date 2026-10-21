import type { VehicleId } from "../../domain/shared/ids";
// Use case: a player tapped the door of a held vehicle's room (ADR 0068).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";

export interface UseDockDoorCommand {
  vehicleId: VehicleId;
}

export class UseDockDoor {
  constructor(private readonly repo: VehicleRepository) {}

  /** Returns whether the door opened or closed. */
  execute(cmd: UseDockDoorCommand): boolean {
    return this.repo.get(cmd.vehicleId)?.useDockDoor() ?? false;
  }
}
