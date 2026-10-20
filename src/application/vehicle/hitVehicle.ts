// Use case: a player hit a vehicle (ADR 0008).

import type { FleetRepository } from "../../domain/vehicle/fleetRepository";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { BreakWorld } from "./ports";
import { retireVehicle } from "./retireVehicle";

export interface HitVehicleCommand {
  vehicleId: string;
  tick: number;
  /** The attacker stands on a deck floor block (ADR 0063). */
  fromDeck: boolean;
}

export class HitVehicle {
  constructor(
    private readonly world: BreakWorld,
    private readonly repo: VehicleRepository,
    private readonly fleets: FleetRepository,
  ) {}

  execute(cmd: HitVehicleCommand): boolean {
    if (cmd.fromDeck) return false;
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle) return false;
    if (!vehicle.receiveHit(cmd.tick)) return false;
    this.world.dropVehicleItem(cmd.vehicleId);
    const fleet = this.fleets.load();
    retireVehicle(this.world, this.repo, fleet, cmd.vehicleId);
    this.fleets.save(fleet);
    return true;
  }
}
