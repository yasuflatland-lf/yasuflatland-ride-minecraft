import type { VehicleId } from "../../domain/shared/ids";
// Use case: a player hit a vehicle (ADR 0008).

import type { FleetRepository } from "../../domain/vehicle/fleet/fleetRepository";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { BreakWorld } from "./ports/fleet";
import type { Clock } from "./ports/shared";
import { retireVehicle } from "./retireVehicle";

export interface HitVehicleCommand {
  vehicleId: VehicleId;
  /** The attacker stands on a deck floor block (ADR 0063). */
  fromDeck: boolean;
}

export class HitVehicle {
  constructor(
    private readonly world: BreakWorld,
    private readonly repo: VehicleRepository,
    private readonly fleets: FleetRepository,
    private readonly clock: Clock,
  ) {}

  execute(cmd: HitVehicleCommand): boolean {
    if (cmd.fromDeck) return false;
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle) return false;
    if (!vehicle.receiveHit(this.clock.now())) return false;
    this.world.dropVehicleItem(cmd.vehicleId);
    const fleet = this.fleets.load();
    retireVehicle(this.world, this.repo, fleet, cmd.vehicleId);
    this.fleets.save(fleet);
    return true;
  }
}
