// Routes a player's hit on a tent from outside: on its blocks, which stay
// world-aligned at every yaw, and on the entity's hidden box (ADR 0130, 0131).
import { GameMode, Player, system, world } from "@minecraft/server";
import type { TakeDownTent } from "../../../../application/camp/takeDownTent";
import { asTentId, type TentId } from "../../../../domain/camp/tent";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import type { Vec3 } from "../../../../domain/shared/vec";
import { TENT_TYPE } from "../../identifiers";

export function registerTentHits(
  takeDown: TakeDownTent,
  owner: (
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ) => TentId | undefined,
): void {
  // A Creative break and a block hit can both fire for one swing; it counts once.
  const swung = new TickScopedSet<PlayerId>();
  const hitTent = (tentId: TentId, player: Player, tick: number) => {
    const playerId = asPlayerId(player.id);
    if (!swung.add(tick, playerId)) return;
    takeDown.execute({ tentId, tick, playerId });
  };
  world.afterEvents.entityHitBlock.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player)) return;
    const block = ev.hitBlock;
    const tentId = owner(
      asDimensionId(block.dimension.id),
      block.location,
      block.typeId,
    );
    if (tentId !== undefined) hitTent(tentId, player, system.currentTick);
  });
  // The shared laid-block guard cancels the break; this only counts it.
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const { player, block } = ev;
    if (player.getGameMode() !== GameMode.Creative) return;
    const tentId = owner(
      asDimensionId(ev.dimension.id),
      block.location,
      block.typeId,
    );
    if (tentId === undefined) return;
    const tick = system.currentTick;
    system.run(() => hitTent(tentId, player, tick));
  });
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    const player = ev.damagingEntity;
    if (!(player instanceof Player) || ev.hitEntity.typeId !== TENT_TYPE)
      return;
    hitTent(asTentId(ev.hitEntity.id), player, system.currentTick);
  });
}
