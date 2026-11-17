import { world } from "@minecraft/server";
import type { RemoveWarpPoint } from "../../../application/warp/removeWarpPoint";
import { asDimensionId } from "../../../domain/shared/ids";
import { WARP_BLOCK_TYPE } from "../identifiers";

export function registerWarpRemoval(
  remove: Pick<RemoveWarpPoint, "run">,
): void {
  world.afterEvents.playerBreakBlock.subscribe((event) => {
    if (event.brokenBlockPermutation.type.id !== WARP_BLOCK_TYPE) return;
    remove.run({
      dimension: asDimensionId(event.dimension.id),
      cell: event.block.location,
    });
  });
}
