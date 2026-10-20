// Use case: a player uses the headlight switch while riding a vehicle (ADR 0020).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { HeadlightWorld } from "./ports/headlights";
import type { Clock } from "./ports/shared";

export interface SwitchHeadlightsCommand {
  playerId: string;
  vehicleId: string;
}

export class SwitchHeadlights {
  constructor(
    private readonly world: HeadlightWorld,
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  execute(cmd: SwitchHeadlightsCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle?.flipHeadlightSwitch(cmd.playerId, this.clock.now()))
      return false;
    const on = this.world.headlightsOn(cmd.vehicleId);
    if (on === undefined) return false;
    this.world.setHeadlights(cmd.vehicleId, !on);
    return true;
  }
}
