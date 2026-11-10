import { Player, system, world } from "@minecraft/server";
import type { TakeBackFurniture } from "../../../../application/resort/takeBackFurniture";
import { asFurnitureId } from "../../../../domain/resort/ids";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { furnitureKindOf } from "../../identifiers";

export function registerFurnitureHits(takeBack: TakeBackFurniture): void {
  const requested = new TickScopedSet<PlayerId>();
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      furnitureKindOf(ev.hitEntity.typeId, "entity") === undefined
    )
      return;
    const player = asPlayerId(ev.damagingEntity.id);
    if (!requested.add(system.currentTick, player)) return;
    if (heldDye(ev.damagingEntity)) return;
    const cmd = {
      id: asFurnitureId(ev.hitEntity.id),
      player,
      now: system.currentTick,
    };
    system.run(() => takeBack.hit(cmd));
  });
}
