import type { VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a press on a held vehicle's shower-toilet swings its door or runs its shower (ADR 0094, 0098, 0118).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

export interface PressShowerToiletCommand {
  vehicleId: VehicleId;
  /** The pressing player's feet in world coordinates. */
  feet: Vec3;
}

export class PressShowerToilet {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns whether the door swung or the shower ran. */
  execute(cmd: PressShowerToiletCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.pressShowerToilet(cmd.feet, this.clock.now()) ?? false
    );
  }
}
