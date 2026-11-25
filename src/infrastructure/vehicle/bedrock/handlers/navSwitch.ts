import type { Entity, Player } from "@minecraft/server";
import type { OpenNav } from "../../../../application/vehicle/openNav";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import { consoleLogger } from "../../../shared/consoleLogger";
import type { SwitchTarget } from "../../../shared/switchRouter";
import { riddenVehicle } from "../riddenVehicle";
import { ridingItemTarget } from "./ridingItemTarget";

export function navSwitchTarget(openNav: OpenNav): SwitchTarget {
  const open = (player: Player, vehicle?: Entity) => {
    void openNav
      .execute({
        playerId: asPlayerId(player.id),
        vehicleId: vehicle === undefined ? undefined : asVehicleId(vehicle.id),
      })
      .catch((error: unknown) =>
        consoleLogger.warn(`Nav use failed: ${String(error)}`),
      );
  };
  const riding = ridingItemTarget(open);
  return {
    ...riding,
    claimsItemUse: () => true,
    switchFor: (player, pressed) => {
      if (pressed === undefined) open(player, riddenVehicle(player));
      else riding.switchFor(player, pressed);
    },
  };
}
