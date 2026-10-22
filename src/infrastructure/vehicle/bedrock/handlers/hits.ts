// Routes a player's hit on a vehicle, or on the stand-in that takes its hits (ADR
// 0116): a held dye repaints it, anything else damages it (ADR 0036).
import { Player, world } from "@minecraft/server";
import type { HitVehicle } from "../../../../application/vehicle/hitVehicle";
import type { PaintVehicle } from "../../../../application/vehicle/paintVehicle";
import { asPlayerId, asVehicleId } from "../../../../domain/shared/ids";
import { standsOnDeck } from "../deck";
import { heldDye } from "../heldDye";
import { vehicleOfTarget } from "../standIns";

export function registerHits(
  hitVehicle: HitVehicle,
  paintVehicle: PaintVehicle,
): void {
  // Painting listens to hits, not interactions: on touch a short tap on an
  // entity is an attack, and the interaction is left to getting in (ADR 0036).
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player)) return;
    const vehicle = vehicleOfTarget(ev.hitEntity);
    if (!vehicle) return;
    const vehicleId = asVehicleId(vehicle.id);
    const paint = heldDye(player);
    if (paint) {
      paintVehicle.execute({
        playerId: asPlayerId(player.id),
        vehicleId,
        paint,
      });
      return;
    }
    hitVehicle.execute({
      playerId: asPlayerId(player.id),
      vehicleId,
      fromDeck: standsOnDeck(player),
    });
  });
}
