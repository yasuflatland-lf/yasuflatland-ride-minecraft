import type { VehicleId } from "../../domain/shared/ids";
// Use case: a player tapped the door of a held vehicle's room (ADR 0068, 0105).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

export interface UseDockDoorCommand {
  vehicleId: VehicleId;
}

export class UseDockDoor {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns whether the door opened or closed. */
  execute(cmd: UseDockDoorCommand): boolean {
    return this.repo.get(cmd.vehicleId)?.useDockDoor(this.clock.now()) ?? false;
  }
}
