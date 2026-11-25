import type { Entity, Player } from "@minecraft/server";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { riddenVehicle } from "../riddenVehicle";
import { vehicleOfTarget } from "../standIns";

export function ridingItemTarget(
  onPress: (player: Player, vehicle: Entity) => void,
): SwitchTarget {
  return {
    claimsItemUse: (player) => riddenVehicle(player) !== undefined,
    claimsEntityPress: (player, target) => {
      const vehicle = vehicleOfTarget(target);
      return vehicle !== undefined && vehicle.id === riddenVehicle(player)?.id;
    },
    claimsBlockPress: () => false,
    switchFor: (player, pressed) => {
      const vehicle = riddenVehicle(player);
      if (!vehicle) return;
      if (
        pressed !== undefined &&
        (!pressed.isValid || vehicleOfTarget(pressed)?.id !== vehicle.id)
      )
        return;
      onPress(player, vehicle);
    },
  };
}
