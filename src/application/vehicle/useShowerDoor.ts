import type { VehicleId } from "../../domain/shared/ids";
// Use case: open or close a held vehicle's shower door, whatever was tapped (ADR 0094, 0105).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

export interface UseShowerDoorCommand {
  vehicleId: VehicleId;
}

export class UseShowerDoor {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns whether the shower door opened or closed. */
  execute(cmd: UseShowerDoorCommand): boolean {
    return (
      this.repo.get(cmd.vehicleId)?.useShowerDoor(this.clock.now()) ?? false
    );
  }
}
