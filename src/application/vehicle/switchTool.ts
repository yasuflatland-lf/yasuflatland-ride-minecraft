import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";

export interface SwitchToolCommand {
  playerId: PlayerId;
  item: string;
  vehicleId: VehicleId;
}

export interface ForceToolCommand {
  vehicleId: VehicleId;
  item: string;
  state: string;
}

export class SwitchTool {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  execute(cmd: SwitchToolCommand): boolean {
    return (
      this.repo
        .get(cmd.vehicleId)
        ?.switchTool(cmd.playerId, cmd.item, this.clock.now()) ?? false
    );
  }

  /** For the server-only test hook only. */
  force(cmd: ForceToolCommand): boolean {
    return (
      this.repo.get(cmd.vehicleId)?.forceTool(cmd.item, cmd.state) ?? false
    );
  }
}
