import type { SwitchTool } from "../../../../application/vehicle/switchTool";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import { heldTypeId } from "../../../shared/heldItem";
import { bareId } from "../../../shared/identifiers";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { riddenVehicle } from "../riddenVehicle";
import { vehicleOfTarget } from "../standIns";

// The headlight switch's click (bedrockHeadlightWorld.ts)
const TOOL_SWITCH_SOUND = "random.click";

export function toolSwitchTarget(switchTool: SwitchTool): SwitchTarget {
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
      if (item === undefined) return;
      const switched = switchTool.execute({
        item,
        playerId: asPlayerId(player.id),
        vehicleId: asVehicleId(vehicle.id),
      });
      if (switched)
        vehicle.dimension.playSound(TOOL_SWITCH_SOUND, vehicle.location);
    },
  };
}
