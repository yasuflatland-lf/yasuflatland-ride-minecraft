import type { SwitchBoost } from "../../../../application/vehicle/switchBoost";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { riddenVehicle } from "../riddenVehicle";
import { vehicleOfTarget } from "../standIns";

export function boosterSwitchTarget(switchBoost: SwitchBoost): SwitchTarget {
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
      switchBoost.execute(
        {
          playerId: asPlayerId(player.id),
          vehicleId: asVehicleId(vehicle.id),
        },
        () => vehicle.dimension.playSound("random.click", vehicle.location),
      );
    },
  };
}
