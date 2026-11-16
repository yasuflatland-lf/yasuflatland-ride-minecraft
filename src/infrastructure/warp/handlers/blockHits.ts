import { type Block, GameMode, Player, system, world } from "@minecraft/server";
import type { HitWarpBlock } from "../../../application/warp/hitWarpBlock";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { TickScopedSet } from "../../../domain/shared/tickScoped";
import { WARP_BLOCK_TYPE } from "../identifiers";

export function registerWarpBlockHits(hit: Pick<HitWarpBlock, "run">): void {
  const requested = new TickScopedSet<PlayerId>();
  const count = (player: Player, block: Block) => {
    const playerId = asPlayerId(player.id);
    const now = system.currentTick;
    if (!requested.add(now, playerId)) return;
    const command = {
      playerId,
      dimension: asDimensionId(block.dimension.id),
      cell: { ...block.location },
      now,
    };
    system.run(() => hit.run(command));
  };
  world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
    if (
      !(damagingEntity instanceof Player) ||
      hitBlock.typeId !== WARP_BLOCK_TYPE
    )
      return;
    count(damagingEntity, hitBlock);
  });
  world.beforeEvents.playerBreakBlock.subscribe((event) => {
    if (
      event.block.typeId !== WARP_BLOCK_TYPE ||
      event.player.getGameMode() !== GameMode.Creative
    )
      return;
    event.cancel = true;
    count(event.player, event.block);
  });
}
