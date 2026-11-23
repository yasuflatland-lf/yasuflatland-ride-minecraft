import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";
import type { SwitchFeedback } from "./switchFeedback";

interface SwitchToolCommand {
  playerId: PlayerId;
  item: string;
  vehicleId: VehicleId;
}

export class SwitchTool {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
    private readonly feedback?: SwitchFeedback,
  ) {}

  execute(cmd: SwitchToolCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle?.switchTool(cmd.playerId, cmd.item, this.clock.now()))
      return false;
    this.feedback?.show(cmd.playerId, cmd.item, vehicle.toolState(cmd.item));
    return true;
  }
}
