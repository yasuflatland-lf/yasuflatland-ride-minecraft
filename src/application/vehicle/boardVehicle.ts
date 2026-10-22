import type { PlayerId, VehicleId } from "../../domain/shared/ids";
// Use case: a player on foot uses a vehicle to get in (ADR 0120).
import type { Vec3 } from "../../domain/shared/vec";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";

export interface BoardVehicleCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The player's eye, as an offset from the vehicle's feet. */
  eye: Vec3;
  /** The player's view direction, absent when their press does not follow it, as on touch. */
  view?: Vec3;
}

export class BoardVehicle {
  constructor(private readonly repo: VehicleRepository) {}

  /**
   * Returns true when the vehicle seats the player itself on its next tick, so the
   * engine's own boarding must be cancelled; false leaves boarding to the engine, also
   * for a vehicle that has not ticked yet.
   */
  execute(cmd: BoardVehicleCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.requestSeat(cmd.playerId, cmd.eye, cmd.view) ?? false
    );
  }
}
