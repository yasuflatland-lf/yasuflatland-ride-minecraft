// The bulldozer blade's target for the shared switch router (ADR 0024, 0134, 0138).
import type { Player } from "@minecraft/server";
import type { SwitchBlade } from "../../../../application/vehicle/switchBlade";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { riddenVehicle } from "../riddenVehicle";
import { vehicleOfTarget } from "../standIns";

// The headlight switch's click (bedrockHeadlightWorld.ts)
const BLADE_SWITCH_SOUND = "random.click";

export function bladeSwitchTarget(blade: SwitchBlade): SwitchTarget {
  return {
    claimsItemUse: (player) => riddenVehicle(player) !== undefined,
    claimsEntityPress: (player, target) => {
      const vehicle = vehicleOfTarget(target);
      return vehicle !== undefined && vehicle.id === riddenVehicle(player)?.id;
    },
    claimsBlockPress: () => false,
    switchFor: (player: Player) => {
      const vehicle = riddenVehicle(player);
      if (!vehicle) return;
      if (
        blade.execute({
          playerId: asPlayerId(player.id),
          vehicleId: asVehicleId(vehicle.id),
        })
      )
        vehicle.dimension.playSound(BLADE_SWITCH_SOUND, vehicle.location);
    },
  };
}
