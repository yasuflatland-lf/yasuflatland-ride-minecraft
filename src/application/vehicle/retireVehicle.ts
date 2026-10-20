// Takes a vehicle out of the game, for a break by hand (ADR 0008, 0038) and
// for an eviction over the limit (ADR 0066). The world removal goes first and
// is not caught: when it throws, the aggregate and the fleet entry stay, so
// LimitVehicles can retry the eviction when the vehicle next loads.
import type { Fleet } from "../../domain/vehicle/fleet/fleet";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { BreakWorld } from "./ports/fleet";

export function retireVehicle(
  world: Pick<BreakWorld, "removeVehicle">,
  repo: VehicleRepository,
  fleet: Fleet,
  vehicleId: string,
): void {
  world.removeVehicle(vehicleId);
  repo.remove(vehicleId);
  fleet.forget(vehicleId);
}
