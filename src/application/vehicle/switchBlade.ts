import type { PlayerId, VehicleId } from "../../domain/shared/ids";
// Use case: the driver raises or lowers the bulldozer's blade (ADR 0138).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

export interface SwitchBladeCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
}

export interface ForceBladeCommand {
  vehicleId: VehicleId;
  raised: boolean;
}

export class SwitchBlade {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns whether the blade's target changed. */
  execute(cmd: SwitchBladeCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.switchBlade(cmd.playerId, this.clock.now()) ?? false
    );
  }

  /** For the server-only test hook only. */
  force(cmd: ForceBladeCommand): boolean {
    return this.repo.get(cmd.vehicleId)?.forceBlade(cmd.raised) ?? false;
  }
}
