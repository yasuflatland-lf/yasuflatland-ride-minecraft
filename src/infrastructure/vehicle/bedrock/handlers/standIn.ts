// A stand-in is never ridden: an interaction with it is cancelled and boards the player
// into its vehicle, as the same interaction with the vehicle would (ADR 0116). The headlight
// switch is handled in headlights.ts, and its hits in hits.ts.
import { system, world } from "@minecraft/server";
import { HEADLIGHT_SWITCH_TYPE, isStandInEntity } from "../identifiers";
import { vehicleOfTarget } from "../standIns";

export function registerStandIns(): void {
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (!isStandInEntity(ev.target.typeId)) return;
    ev.cancel = true;
    // headlights.ts switches the headlights or the room's ceiling lights; a switch press on
    // the bumper never boards, so a player in the room keeps their seatless press (ADR 0115).
    if (ev.itemStack?.typeId === HEADLIGHT_SWITCH_TYPE) return;
    const { player } = ev;
    // As minecraft:rideable's crouching_skip_interact on the vehicle.
    if (player.isSneaking) return;
    const vehicle = vehicleOfTarget(ev.target);
    if (!vehicle) return;
    if (
      player.getComponent("minecraft:riding")?.entityRidingOn?.id === vehicle.id
    )
      return;
    // Before events cannot change the world, so the player boards on the next tick.
    system.run(() => {
      if (!player.isValid || !vehicle.isValid) return;
      vehicle.getComponent("minecraft:rideable")?.addRider(player);
    });
  });
}
