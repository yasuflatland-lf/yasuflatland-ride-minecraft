import { Player, system, world } from "@minecraft/server";
import type { TakeBackParasol } from "../../../../application/resort/takeBackParasol";
import { asParasolId } from "../../../../domain/resort/ids";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { BEACH_PARASOL } from "../../identifiers";

export function registerParasolHits(takeBack: TakeBackParasol): void {
  const requested = new TickScopedSet<PlayerId>();
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== BEACH_PARASOL
    )
      return;
    const player = asPlayerId(ev.damagingEntity.id);
    if (!requested.add(system.currentTick, player)) return;
    takeBack.execute({
      id: asParasolId(ev.hitEntity.id),
      player,
      tick: system.currentTick,
    });
  });
}
