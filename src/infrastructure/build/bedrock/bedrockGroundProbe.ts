import { world } from "@minecraft/server";
import type { GroundProbe } from "../../../application/build/ports/ground";
import { isGroundBlock } from "../../../domain/build/clipboard/groundBlocks";
import { BUILD_SPEC } from "../../../domain/build/spec";
import type { DimensionId } from "../../../domain/shared/ids";

export class BedrockGroundProbe implements GroundProbe {
  topSolidY(
    dimensionId: DimensionId,
    x: number,
    z: number,
    fromY: number,
  ): number | undefined {
    try {
      const dimension = world.getDimension(dimensionId);
      for (let depth = 0; depth < BUILD_SPEC.groundSearchDepth; depth++) {
        const y = fromY - depth;
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
