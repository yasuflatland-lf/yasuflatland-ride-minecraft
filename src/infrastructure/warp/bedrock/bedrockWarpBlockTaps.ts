import { type Block, ItemStack, world } from "@minecraft/server";
import type { WarpBlockTaps } from "../../../application/warp/ports/blockTaps";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { giveOrDrop, playerById } from "../../shared/players";
import { WARP_BLOCK_TYPE } from "../identifiers";
import { WARP_MESSAGE } from "../messages";

export class BedrockWarpBlockTaps implements WarpBlockTaps {
  at(playerId: PlayerId, dimension: DimensionId, cell: Cell) {
    const player = playerById(playerId);
    if (!player?.isValid) return undefined;
    let block: Block | undefined;
    try {
      block = world.getDimension(dimension).getBlock(cell);
      if (block?.typeId !== WARP_BLOCK_TYPE) return undefined;
    } catch {
      return undefined;
    }
    const target = block;
    return {
      drop: () => giveOrDrop(player, [new ItemStack(WARP_BLOCK_TYPE, 1)]),
      remove: () => {
        target.setType("minecraft:air");
        player.onScreenDisplay.setActionBar({
          translate: WARP_MESSAGE.blockBroken,
        });
      },
      showRemaining: (left: number) =>
        player.onScreenDisplay.setActionBar({
          translate: left === 1 ? WARP_MESSAGE.tapLeft : WARP_MESSAGE.tapsLeft,
          with: [String(left)],
        }),
    };
  }
}
