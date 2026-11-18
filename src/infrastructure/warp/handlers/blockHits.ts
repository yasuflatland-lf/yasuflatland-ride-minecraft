import { type Block, GameMode, Player, system, world } from "@minecraft/server";
import type { RenameWarpPoint } from "../../../application/warp/renameWarpPoint";
import { asDimensionId, asPlayerId } from "../../../domain/shared/ids";
import { WARP_BLOCK_TYPE } from "../identifiers";
import type { WarpFormGuard } from "./formGuard";

// A long press on touch reaches scripts as a block hit, so a hit opens the
// rename form; taps arrive as interactions and break the block (ADR 0249).
export function registerWarpBlockHits(
  rename: Pick<RenameWarpPoint, "run">,
  guard: WarpFormGuard,
): void {
  const open = (player: Player, block: Block) => {
    const playerId = asPlayerId(player.id);
    if (!guard.tryOpen(playerId, system.currentTick)) return;
    const command = {
      playerId,
      dimension: asDimensionId(block.dimension.id),
      cell: { ...block.location },
    };
    // Before-events are read-only; reserve the guard now to coalesce both paths.
    system.run(() => {
      void guard.run(playerId, async () => {
        if (player.isValid) await rename.run(command);
      });
    });
  };
  world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
    if (
      !(damagingEntity instanceof Player) ||
      hitBlock.typeId !== WARP_BLOCK_TYPE
    )
      return;
    open(damagingEntity, hitBlock);
  });
  world.beforeEvents.playerBreakBlock.subscribe((event) => {
    if (
      event.block.typeId !== WARP_BLOCK_TYPE ||
      event.player.getGameMode() !== GameMode.Creative
    )
      return;
    event.cancel = true;
    open(event.player, event.block);
  });
}
