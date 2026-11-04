import type { Dimension, Vector3 } from "@minecraft/server";

// getBlock returns undefined in an unloaded chunk but can also throw
// LocationInUnloadedChunkError; both mean the chunk unloaded (ADR 0125).
export function chunkLoadedAt(
  dimension: Dimension,
  location: Vector3,
): boolean {
  try {
    return dimension.getBlock(location) !== undefined;
  } catch {
    return false;
  }
}
