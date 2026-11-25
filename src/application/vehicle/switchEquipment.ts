import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { EquipmentSwitch } from "../../domain/vehicle/equipment/equipment";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { Clock } from "./ports/shared";
import type { SwitchFeedback } from "./switchFeedback";

interface SwitchEquipmentCommand {
  playerId: PlayerId;
  switch: EquipmentSwitch;
  vehicleId: VehicleId;
}

export class SwitchEquipment {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
    private readonly feedback?: SwitchFeedback,
  ) {}

  execute(cmd: SwitchEquipmentCommand): boolean {
    const vehicle = this.repo.get(cmd.vehicleId);
    if (!vehicle?.switchEquipment(cmd.playerId, cmd.switch, this.clock.now()))
      return false;
    this.feedback?.show(
      cmd.playerId,
      cmd.switch.item,
      vehicle.equipmentState(cmd.switch),
    );
    return true;
  }
}
