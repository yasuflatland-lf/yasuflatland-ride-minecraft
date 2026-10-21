// Reads the block types of world cells for a vehicle's checks (ADR 0068, 0108).
import type { Entity } from "@minecraft/server";
import type { Vec3 } from "../../../domain/shared/vec";
import { isLightBlock } from "./headlightBlocks";
import { AIR_BLOCK } from "./identifiers";

/** See TickContext.blockTypes: every cell is undefined for a missing vehicle. */
export function blockTypesNear(
  vehicle: Entity | undefined,
  cells: readonly Vec3[],
): (string | undefined)[] {
  if (!vehicle) return cells.map(() => undefined);
  return cells.map((c) => {
    try {
      const b = vehicle.dimension.getBlock(c);
      if (!b) return undefined;
      return b.isAir || isLightBlock(b) ? AIR_BLOCK : b.typeId;
    } catch {
      return undefined; // Unloaded chunk or outside the world
    }
  });
}
