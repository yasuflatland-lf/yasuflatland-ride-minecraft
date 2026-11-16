import { type Block, type Dimension, world } from "@minecraft/server";
import type { WarpWorld } from "../../../application/warp/ports/world";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { BlockPresence } from "../../../domain/warp/presence";
import type { WarpPoint } from "../../../domain/warp/warpPoint";
import { playerById } from "../../shared/players";
import { WARP_BLOCK_TYPE } from "../identifiers";

const LANDING_HAZARDS = new Set([
  "minecraft:lava",
  "minecraft:flowing_lava",
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:cactus",
  "minecraft:magma",
]);

// Block.isSolid is not in stable 2.11.0; a one-cell search excludes passable blocks.
function isSolid(dimension: Dimension, cell: Cell): boolean {
  const block = dimension.getBlockAbove(
    { ...cell, y: cell.y - 1 },
    {
      maxDistance: 1,
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    },
  );
  return (
    block !== undefined &&
    block.location.x === cell.x &&
    block.location.y === cell.y &&
    block.location.z === cell.z
  );
}

function isPassable(dimension: Dimension, cell: Cell, block: Block): boolean {
  return block.isAir || (!block.isLiquid && !isSolid(dimension, cell));
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
      if (
        [floor, body, head].some((block) => LANDING_HAZARDS.has(block.typeId))
      )
        return false;
      return (
        !floor.isAir &&
        !floor.isLiquid &&
        isSolid(dimension, floorCell) &&
        isPassable(dimension, feet, body) &&
        isPassable(dimension, headCell, head)
      );
    } catch {
      return false;
    }
  }

  teleport(playerId: PlayerId, dimensionId: DimensionId, feet: Cell): boolean {
    try {
      const player = playerById(playerId);
      if (!player?.isValid) return false;
      // Unloaded-chunk teleport behavior needs the #1781 probe; a throw reports failure to the use case.
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
