import { system } from "@minecraft/server";
import type { OpenWarpList } from "../../../application/warp/openWarpList";
import type { RenameWarpPoint } from "../../../application/warp/renameWarpPoint";
import { asDimensionId, asPlayerId } from "../../../domain/shared/ids";
import { WARP_BLOCK_COMPONENT } from "../identifiers";
import type { WarpFormGuard } from "./formGuard";

export function registerWarpBlockInteract(
  rename: Pick<RenameWarpPoint, "run">,
  list: Pick<OpenWarpList, "run">,
  guard: WarpFormGuard,
): void {
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(WARP_BLOCK_COMPONENT, {
      onPlayerInteract: ({ player, block, dimension }) => {
        if (!player?.isValid) return;
        const playerId = asPlayerId(player.id);
        if (!guard.tryOpen(playerId, system.currentTick)) return;
        void guard.run(playerId, () =>
          player.isSneaking
            ? rename.run({
                playerId,
                dimension: asDimensionId(dimension.id),
                cell: block.location,
              })
            : list.run(playerId),
        );
      },
    });
  });
}
