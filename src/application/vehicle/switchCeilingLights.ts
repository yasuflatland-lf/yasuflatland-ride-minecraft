import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
// Use case: a player in a parked camper's room uses the headlight switch to turn its ceiling lights on or off (ADR 0115).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

export interface SwitchCeilingLightsCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The player's feet in world coordinates. */
  feet: Vec3;
}

export class SwitchCeilingLights {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns whether the ceiling lights turned on or off. */
  execute(cmd: SwitchCeilingLightsCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.switchCeilingLights(cmd.playerId, cmd.feet, this.clock.now()) ?? false
    );
  }

  /** Whether the player's use would reach the ceiling lights, without switching them. */
  canSwitch(cmd: SwitchCeilingLightsCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.canSwitchCeilingLights(cmd.playerId, cmd.feet) ?? false
    );
  }
}
