// Routes a player's hit on a low chair (ADR 0121). The vehicles' hit handler
// only takes vehicle and stand-in types, so the two never see each other's hits.
import { Player, system, world } from "@minecraft/server";
import type { HitChair } from "../../../../application/camp/hitChair";
import { asChairId } from "../../../../domain/camp/chair";
import { asPlayerId } from "../../../../domain/shared/ids";
import { LOW_CHAIR_TYPE } from "../../identifiers";

export function registerChairHits(hitChair: HitChair): void {
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player) || ev.hitEntity.typeId !== LOW_CHAIR_TYPE)
      return;
    hitChair.execute({
      chairId: asChairId(ev.hitEntity.id),
      tick: system.currentTick,
      playerId: asPlayerId(player.id),
    });
  });
}
