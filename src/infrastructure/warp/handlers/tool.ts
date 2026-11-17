import { type Player, system, world } from "@minecraft/server";
import type { OpenWarpList } from "../../../application/warp/openWarpList";
import { asPlayerId } from "../../../domain/shared/ids";
import { WARP_TOOL_TYPE } from "../identifiers";
import type { WarpFormGuard } from "./formGuard";

export function registerWarpTool(
  list: Pick<OpenWarpList, "run">,
  guard: WarpFormGuard,
): void {
  const open = (player: Player) => {
    if (!player.isValid) return;
    const playerId = asPlayerId(player.id);
    if (!guard.tryOpen(playerId, system.currentTick)) return;
    // Before-events are read-only; reserve the guard now to coalesce both paths.
    system.run(() => {
      void guard.run(playerId, async () => {
        if (player.isValid) await list.run(playerId);
      });
    });
  };
  world.beforeEvents.itemUse.subscribe((event) => {
    if (event.itemStack.typeId !== WARP_TOOL_TYPE) return;
    event.cancel = true;
    open(event.source);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    if (event.itemStack?.typeId !== WARP_TOOL_TYPE) return;
    event.cancel = true;
    if (event.isFirstEvent) open(event.player);
  });
}
