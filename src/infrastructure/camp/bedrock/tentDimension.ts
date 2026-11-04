import { type Dimension, world } from "@minecraft/server";
import type { DimensionId } from "../../../domain/shared/ids";
export function dimensionOf(dimensionId: DimensionId): Dimension | undefined {
  try {
    return world.getDimension(dimensionId);
  } catch {
    return undefined; // Unknown dimension id
  }
}
