import { system, world } from "@minecraft/server";
import type { UseToilet } from "../../../../application/resort/useToilet";
import { asFurnitureId } from "../../../../domain/resort/ids";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { FURNITURE_IDS } from "../../identifiers";

export function registerToiletInteraction(useCase: UseToilet): void {
  const requested = new TickScopedSet<PlayerId>();
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== FURNITURE_IDS.toilet.entity) return;
    ev.cancel = true;
    const player = asPlayerId(ev.player.id);
    if (!requested.add(system.currentTick, player)) return;
    const id = asFurnitureId(ev.target.id);
    system.run(() => useCase.execute({ id, player, now: system.currentTick }));
  });
}
