import type { Block, Dimension, Vector3 } from "@minecraft/server";
import type { Cell } from "../../domain/shared/cells";

/** The block at `cell`, or undefined for an unknown dimension, an unloaded chunk, or a cell outside the world. */
export function safeBlockAt(
  dimension: Dimension | undefined,
  cell: Cell,
): Block | undefined {
  try {
    return dimension?.getBlock(cell);
  } catch {
    return undefined;
  }
}

/** Whether the chunk is loaded; getBlock can return undefined or throw LocationInUnloadedChunkError (ADR 0125). */
export function chunkLoadedAt(
  dimension: Dimension,
  location: Vector3,
): boolean {
  return safeBlockAt(dimension, location) !== undefined;
}
