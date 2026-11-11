import { world } from "@minecraft/server";
import type { GroundProbe } from "../../../application/build/ports/ground";
import { isGroundBlock } from "../../../domain/build/clipboard/groundBlocks";
import type { DimensionId } from "../../../domain/shared/ids";

export class BedrockGroundProbe implements GroundProbe {
  topSolidY(
    dimensionId: DimensionId,
    x: number,
    z: number,
    fromY: number,
    toY: number,
  ): number | undefined {
    try {
      const dimension = world.getDimension(dimensionId);
      for (let y = fromY; y >= toY; y--) {
        const block = dimension.getBlock({ x, y, z });
        if (!block) return undefined;
        if (!block.isAir && !block.isLiquid && isGroundBlock(block.typeId))
          return y;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
}
