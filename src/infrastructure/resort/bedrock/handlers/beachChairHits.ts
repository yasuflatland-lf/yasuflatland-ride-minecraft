import { GameMode, Player, system, world } from "@minecraft/server";
import type { TakeBackBeachChair } from "../../../../application/resort/takeBackBeachChair";
import {
  asBeachChairId,
  type BeachChairId,
} from "../../../../domain/resort/ids";
import type { Cell } from "../../../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { BEACH_CHAIR } from "../../identifiers";

export function registerBeachChairHits(
  takeBack: TakeBackBeachChair,
  owner: (
    dimension: DimensionId,
    cell: Cell,
    typeId: string,
  ) => string | undefined = () => undefined,
): void {
  const requested = new TickScopedSet<PlayerId>();
  const hit = (player: Player, id: BeachChairId) => {
    const playerId = asPlayerId(player.id);
    if (heldDye(player) || !requested.add(system.currentTick, playerId)) return;
    const cmd = { id, player: playerId, tick: system.currentTick };
    system.run(() => takeBack.execute(cmd));
  };
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (
      !(ev.damagingEntity instanceof Player) ||
      ev.hitEntity.typeId !== BEACH_CHAIR
    )
      return;
    hit(ev.damagingEntity, asBeachChairId(ev.hitEntity.id));
  });
  world.afterEvents.entityHitBlock.subscribe((ev) => {
    if (!(ev.damagingEntity instanceof Player)) return;
    const block = ev.hitBlock;
    const id = owner(
      asDimensionId(block.dimension.id),
      block.location,
      block.typeId,
    );
    if (id !== undefined) hit(ev.damagingEntity, asBeachChairId(id));
  });
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.player.getGameMode() !== GameMode.Creative) return;
    const id = owner(
      asDimensionId(ev.dimension.id),
      ev.block.location,
      ev.block.typeId,
    );
    if (id !== undefined) hit(ev.player, asBeachChairId(id));
  });
}
