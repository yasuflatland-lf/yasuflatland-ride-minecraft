import type { SwitchBoost } from "../../../../application/vehicle/switchBoost";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { ridingItemTarget } from "./ridingItemTarget";

export function boosterSwitchTarget(switchBoost: SwitchBoost): SwitchTarget {
  return ridingItemTarget((player, vehicle) => {
    switchBoost.execute(
      {
        playerId: asPlayerId(player.id),
        vehicleId: asVehicleId(vehicle.id),
      },
      () => vehicle.dimension.playSound("random.click", vehicle.location),
    );
  });
}
