import { system } from "@minecraft/server";
import type { OpenWarpList } from "../../../application/warp/openWarpList";
import type { TapWarpBlock } from "../../../application/warp/tapWarpBlock";
import { cellOf } from "../../../domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { TickScopedSet } from "../../../domain/shared/tickScoped";
import { consoleLogger } from "../../shared/consoleLogger";
import { WARP_BLOCK_COMPONENT } from "../identifiers";
import type { WarpFormGuard } from "./formGuard";

export function registerWarpBlockInteract(
  tap: Pick<TapWarpBlock, "run">,
  list: Pick<OpenWarpList, "run">,
  guard: WarpFormGuard,
): void {
  const tapped = new TickScopedSet<PlayerId>();
  system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent(WARP_BLOCK_COMPONENT, {
      onPlayerInteract: ({ player, block, dimension }) => {
        if (!player?.isValid) return;
        const playerId = asPlayerId(player.id);
        const now = system.currentTick;
        if (!tapped.add(now, playerId)) return;
        const command = {
          playerId,
          dimension: asDimensionId(dimension.id),
          cell: cellOf({ ...block.location }),
          now,
        };
        system.run(() => {
          tap.run(command).then(
            (settled) => {
              if (!settled || !player.isValid) return;
              if (!guard.tryOpen(playerId, system.currentTick)) return;
              void guard.run(playerId, () => list.run(playerId));
            },
            (error) => consoleLogger.warn(`Warp tap failed: ${error}`),
          );
        });
      },
    });
  });
}
