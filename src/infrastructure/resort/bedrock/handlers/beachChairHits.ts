import { Player, system, world } from "@minecraft/server";
import type { TakeBackBeachChair } from "../../../../application/resort/takeBackBeachChair";
import { asBeachChairId } from "../../../../domain/resort/ids";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { BEACH_CHAIR } from "../../identifiers";

export function registerBeachChairHits(takeBack: TakeBackBeachChair): void {
  const requested = new TickScopedSet<PlayerId>();
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== BEACH_CHAIR
    )
      return;
    const player = asPlayerId(ev.damagingEntity.id);
    if (!requested.add(system.currentTick, player)) return;
    if (heldDye(ev.damagingEntity)) return;
    const cmd = {
      id: asBeachChairId(ev.hitEntity.id),
      player,
      tick: system.currentTick,
    };
    system.run(() => takeBack.execute(cmd));
  });
}
