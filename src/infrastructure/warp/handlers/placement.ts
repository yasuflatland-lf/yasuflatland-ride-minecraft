import { ItemStack, system, world } from "@minecraft/server";
import type { RegisterWarpPoint } from "../../../application/warp/registerWarpPoint";
import { cellOf } from "../../../domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../domain/shared/ids";
import { giveOrDrop, isCreative } from "../../shared/players";
import { WARP_BLOCK_TYPE } from "../identifiers";
import type { WarpFormGuard } from "./formGuard";

export function registerWarpPlacement(
  register: Pick<RegisterWarpPoint, "run">,
  guard: WarpFormGuard,
): void {
  world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
    if (block.typeId !== WARP_BLOCK_TYPE) return;
    const playerId = asPlayerId(player.id);
    const dimension = asDimensionId(block.dimension.id);
    const cell = cellOf({ ...block.location });
    // Placement must register even while an earlier naming form is pending.
    guard.hold(playerId, system.currentTick);
    void guard.run(playerId, async () => {
      const result = await register.run({ playerId, dimension, cell });
      if (result !== "full") return;
      block.setType("minecraft:air");
      if (!isCreative(player))
        giveOrDrop(player, [new ItemStack(WARP_BLOCK_TYPE, 1)]);
    });
  });
}
