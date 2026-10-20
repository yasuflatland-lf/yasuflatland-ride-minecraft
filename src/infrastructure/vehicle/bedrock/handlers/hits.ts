// Routes a player's hit on a vehicle: a held dye repaints it, anything else
// damages it (ADR 0036).
import { Player, world } from "@minecraft/server";
import type { HitVehicle } from "../../../../application/vehicle/hitVehicle";
import type { PaintVehicle } from "../../../../application/vehicle/paintVehicle";
import { standsOnDeck } from "../deck";
import { heldDye } from "../heldDye";
import { isVehicleEntity } from "../identifiers";

export function registerHits(
  hitVehicle: HitVehicle,
  paintVehicle: PaintVehicle,
): void {
  // Painting listens to hits, not interactions: on touch a short tap on an
  // entity is an attack, and the interaction is left to getting in (ADR 0036).
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!isVehicleEntity(ev.hitEntity.typeId) || !(player instanceof Player))
      return;
    const paint = heldDye(player);
    if (paint) {
      paintVehicle.execute({
        playerId: player.id,
        vehicleId: ev.hitEntity.id,
        paint,
      });
      return;
    }
    hitVehicle.execute({
      vehicleId: ev.hitEntity.id,
      fromDeck: standsOnDeck(player),
    });
  });
}
