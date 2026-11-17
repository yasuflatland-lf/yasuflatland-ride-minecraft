import { type Block, type Dimension, world } from "@minecraft/server";
import type { WarpWorld } from "../../../application/warp/ports/world";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import {
  isStandableLanding,
  type LandingSample,
} from "../../../domain/warp/landing";
import type { BlockPresence } from "../../../domain/warp/presence";
import type { WarpPoint } from "../../../domain/warp/warpPoint";
import { playerById } from "../../shared/players";
import { WARP_BLOCK_TYPE } from "../identifiers";

// BDS 1.26.63.1 includes the origin cell; starting below it tests the wrong block.
function isSolid(dimension: Dimension, cell: Cell): boolean {
  const block = dimension.getBlockAbove(cell, {
    maxDistance: 1,
    includeLiquidBlocks: false,
    includePassableBlocks: false,
  });
  return (
    block !== undefined &&
    block.location.x === cell.x &&
    block.location.y === cell.y &&
    block.location.z === cell.z
  );
}

function sample(dimension: Dimension, cell: Cell, block: Block): LandingSample {
  return {
    typeId: block.typeId,
    isAir: block.isAir,
    isLiquid: block.isLiquid,
    solid: isSolid(dimension, cell),
  };
}

export class BedrockWarpWorld implements WarpWorld {
  presence(point: WarpPoint): BlockPresence {
    try {
      const block = world.getDimension(point.dimension).getBlock(point.cell);
      if (!block) return "unloaded";
      return block.typeId === WARP_BLOCK_TYPE ? "present" : "gone";
    } catch {
      return "unloaded";
    }
  }

  isStandable(dimensionId: DimensionId, feet: Cell): boolean {
    try {
      const dimension = world.getDimension(dimensionId);
      const floorCell = { ...feet, y: feet.y - 1 };
      const headCell = { ...feet, y: feet.y + 1 };
      const floor = dimension.getBlock(floorCell);
      const body = dimension.getBlock(feet);
      const head = dimension.getBlock(headCell);
      if (!floor || !body || !head) return false;
      return isStandableLanding(
        sample(dimension, floorCell, floor),
        sample(dimension, feet, body),
        sample(dimension, headCell, head),
      );
    } catch {
      return false;
    }
  }

  teleport(playerId: PlayerId, dimensionId: DimensionId, feet: Cell): boolean {
    try {
      const player = playerById(playerId);
      if (!player?.isValid) return false;
      // An unloaded target does not throw on BDS 1.26.63.1 (ADR 0249 probe); a throw still reports failure.
      player.teleport(
        { x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 },
        { dimension: world.getDimension(dimensionId) },
      );
      return true;
    } catch {
      return false;
    }
  }
}
