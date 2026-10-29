import { type Entity, world } from "@minecraft/server";

const HOST_REACH_OFFSETS = [-1, 0, 1] as const;

export function loadedEntityIds(type: string): string[] {
  return ["overworld", "nether", "the_end"].flatMap((dimension) =>
    world
      .getDimension(dimension)
      .getEntities({ type })
      .map((entity) => entity.id),
  );
}

export function hostExists(id: string): boolean {
  return world.getEntity(id)?.isValid === true;
}

/**
 * True only when the item's own cell, the cell below it, and the 3x3 cells
 * around it are loaded, since a host in an unloaded chunk reads as missing
 * (ADR 0185).
 */
export function isHostAreaLoaded(item: Entity | undefined): boolean {
  if (!item) return false;
  try {
    const at = item.location;
    if (item.dimension.getBlock({ ...at, y: at.y - 1 }) === undefined)
      return false;
    // A table item can sit up to TABLE_TOP_HALF_PX (under one block) off
    // the table's position, so the table may be in a neighbouring chunk.
    // Requiring the 3x3 cells around the item covers wherever it can be.
    for (const dx of HOST_REACH_OFFSETS)
      for (const dz of HOST_REACH_OFFSETS)
        if (
          item.dimension.getBlock({ ...at, x: at.x + dx, z: at.z + dz }) ===
          undefined
        )
          return false;
    return true;
  } catch {
    return false;
  }
}
