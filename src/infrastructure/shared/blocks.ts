import {
  type Block,
  type Dimension,
  Direction,
  type Vector3,
  world,
} from "@minecraft/server";
import {
  type Cell,
  cellCenter,
  cellOf,
  sameCell,
} from "../../domain/shared/cells";
import type { DimensionId } from "../../domain/shared/ids";
import type { StandSample } from "../../domain/shared/standing";
import type { Vec3 } from "../../domain/shared/vec";

/** The block at `cell`, or undefined for an unknown dimension, an unloaded chunk, or a cell outside the world. */
export function safeBlockAt(
  dimension: Dimension | undefined,
  cell: Vec3,
): Block | undefined {
  try {
    return dimension?.getBlock(cell);
  } catch {
    return undefined;
  }
}

export function sampleBlock(
  dimension: Dimension,
  cell: Cell,
  { probeSolidity = true } = {},
): StandSample | undefined {
  try {
    const block = dimension.getBlock(cell);
    if (!block) return undefined;
    const { typeId, isAir, isLiquid } = block;
    // BDS 1.26.63.1 includes the origin cell; starting below it tests the wrong block.
    const hit = probeSolidity
      ? dimension.getBlockAbove(cell, {
          maxDistance: 1,
          includeLiquidBlocks: false,
          includePassableBlocks: false,
        })
      : undefined;
    return {
      typeId,
      isAir,
      isLiquid,
      solidTop: hit !== undefined && sameCell(cellOf(hit.location), cell),
    };
  } catch {
    return undefined;
  }
}

/** The block at `cell` in the named dimension, or undefined for an unknown dimension, unloaded chunk, or out-of-world cell. */
export function blockIn(
  dimensionId: DimensionId,
  cell: Vec3,
): Block | undefined {
  try {
    return world.getDimension(dimensionId).getBlock(cell);
  } catch {
    return undefined;
  }
}

/** Whether a non-passable block's full-height top face is the top of `cell` (ADR 0111). */
export function isSolidTop(dimensionId: DimensionId, cell: Cell): boolean {
  try {
    // Stable 2.x has no solidity flag; a non-passable ray must meet the top at full height.
    // A ray that ends exactly on the face misses it on BDS, so it starts half a block above.
    const hit = world.getDimension(dimensionId).getBlockFromRay(
      cellCenter(cell, 1.5),
      { x: 0, y: -1, z: 0 },
      {
        maxDistance: 1,
        includeLiquidBlocks: false,
        includePassableBlocks: false,
      },
    );
    return (
      hit?.face === Direction.Up &&
      // The engine reports faceLocation.y inverted, so a full top reads 0 (ADR 0111).
      hit.faceLocation.y === 0 &&
      sameCell(cellOf(hit.block.location), cell)
    );
  } catch {
    return false;
  }
}

/** Whether the chunk is loaded; getBlock can return undefined or throw LocationInUnloadedChunkError (ADR 0125). */
export function chunkLoadedAt(
  dimension: Dimension,
  location: Vector3,
): boolean {
  return safeBlockAt(dimension, location) !== undefined;
}
