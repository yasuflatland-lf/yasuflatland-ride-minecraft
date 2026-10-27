// Routes a player's hit on a chair (ADR 0122). The vehicles' hit handler
// only takes vehicle and stand-in types, so the two never see each other's hits.
import { Player, system, world } from "@minecraft/server";
import type { HitChair } from "../../../../application/camp/hitChair";
import { asChairId } from "../../../../domain/camp/chair";
import { asPlayerId } from "../../../../domain/shared/ids";
import { CHAIR_KIND_BY_TYPE } from "../../identifiers";

export function registerChairHits(hitChair: HitChair): void {
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    const kind = CHAIR_KIND_BY_TYPE.get(ev.hitEntity.typeId);
    if (!(player instanceof Player) || kind === undefined) return;
    hitChair.execute({
      kind,
      chairId: asChairId(ev.hitEntity.id),
      tick: system.currentTick,
      playerId: asPlayerId(player.id),
    });
  });
}
