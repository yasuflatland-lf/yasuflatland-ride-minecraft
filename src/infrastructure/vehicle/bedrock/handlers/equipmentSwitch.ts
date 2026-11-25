import type { SwitchEquipment } from "../../../../application/vehicle/switchEquipment";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import { equipmentSwitchOf } from "../../../../domain/vehicle/kinds/index";
import { heldTypeId } from "../../../shared/heldItem";
import { bareId } from "../../../shared/identifiers";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { riddenVehicle } from "../riddenVehicle";
import { vehicleOfTarget } from "../standIns";

// The headlight switch's click (bedrockHeadlightWorld.ts)
const TOOL_SWITCH_SOUND = "random.click";

export function equipmentSwitchTarget(
  switchEquipment: SwitchEquipment,
): SwitchTarget {
  return {
    claimsItemUse: (player) => riddenVehicle(player) !== undefined,
    claimsEntityPress: (player, target) => {
      const vehicle = vehicleOfTarget(target);
      return vehicle !== undefined && vehicle.id === riddenVehicle(player)?.id;
    },
    claimsBlockPress: () => false,
    switchFor: (player) => {
      const vehicle = riddenVehicle(player);
      if (!vehicle) return;
      const typeId = heldTypeId(player);
      const item = typeId === undefined ? undefined : bareId(typeId);
      const equipmentSwitch =
        item === undefined ? undefined : equipmentSwitchOf(item);
      if (!equipmentSwitch) return;
      const switched = switchEquipment.execute({
        switch: equipmentSwitch,
        playerId: asPlayerId(player.id),
        vehicleId: asVehicleId(vehicle.id),
      });
      if (switched)
        vehicle.dimension.playSound(TOOL_SWITCH_SOUND, vehicle.location);
    },
  };
}
