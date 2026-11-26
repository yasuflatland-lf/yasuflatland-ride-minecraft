import { type Player, system, world } from "@minecraft/server";
import type { GuideNav } from "../../../../application/vehicle/guideNav";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import type { NavGuideTrigger } from "../../../../domain/vehicle/navigation/navGuide";
import { consoleLogger } from "../../../shared/consoleLogger";
import { NAV_TYPE } from "../identifiers";
import { controlsOf } from "../inputControls";
import { riddenVehicle } from "../riddenVehicle";

export function registerNavGuide(guideNav: GuideNav): void {
  const guide = (player: Player, trigger: NavGuideTrigger) => {
    try {
      if (!player.isValid) return;
      const vehicle = riddenVehicle(player);
      guideNav.execute({
        playerId: asPlayerId(player.id),
        vehicleId: vehicle === undefined ? undefined : asVehicleId(vehicle.id),
        controls: controlsOf(player),
        trigger,
        tick: system.currentTick,
      });
    } catch (error) {
      consoleLogger.warn(`Nav guide failed: ${String(error)}`);
    }
  };
  world.afterEvents.playerHotbarSelectedSlotChange.subscribe((ev) => {
    if (ev.itemStack?.typeId === NAV_TYPE) guide(ev.player, "select");
  });
  world.afterEvents.playerSwingStart.subscribe((ev) => {
    if (ev.heldItemStack?.typeId === NAV_TYPE) guide(ev.player, "tap");
  });
}
