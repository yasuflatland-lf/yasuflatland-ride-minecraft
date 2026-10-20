// Switches the ridden vehicle's headlights with the headlight switch item,
// whether its use reaches itemUse or an interaction with the vehicle (ADR 0020, 0024).
import { type Entity, system, world } from "@minecraft/server";
import type { SwitchHeadlights } from "../../../../application/vehicle/switchHeadlights";
import { HEADLIGHT_SWITCH_TYPE, isVehicleEntity } from "../identifiers";

export function registerHeadlights(headlights: SwitchHeadlights): void {
  const ridden = (player: Entity) => {
    const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    return isVehicleEntity(mount?.typeId) ? mount : undefined;
  };
  const switchHeadlights = (playerId: string, vehicleId: string) =>
    headlights.execute({
      playerId,
      vehicleId,
    });

  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const vehicle = ridden(ev.source);
    if (vehicle) switchHeadlights(ev.source.id, vehicle.id);
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (!isVehicleEntity(ev.target.typeId)) return;
    // A rider aiming at their own vehicle interacts with it instead of using
    // the item, so the switch is handled here too.
    if (
      ev.itemStack?.typeId === HEADLIGHT_SWITCH_TYPE &&
      ridden(ev.player)?.id === ev.target.id
    ) {
      ev.cancel = true;
      const playerId = ev.player.id;
      const vehicleId = ev.target.id;
      system.run(() => switchHeadlights(playerId, vehicleId));
    }
  });
}
