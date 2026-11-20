import type { VehicleId } from "../../domain/shared/ids";
import { CAMPER_ROOM } from "../../domain/vehicle/kinds/index";
// Use case: a player tapped the door of a held vehicle's room (ADR 0068, 0105).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

interface UseDockDoorCommand {
  vehicleId: VehicleId;
}

export class UseDockDoor {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns whether the door opened or closed. */
  execute(cmd: UseDockDoorCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.capability(CAMPER_ROOM)
        ?.fixtures.useDockDoor(this.clock.now()) ?? false
    );
  }
}
