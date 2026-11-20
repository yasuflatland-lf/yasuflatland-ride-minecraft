import { type Dimension, world } from "@minecraft/server";
import type { DimensionId } from "../../domain/shared/ids";

export const DIMENSION_IDS = ["overworld", "nether", "the_end"] as const;

/** Every dimension, in DIMENSION_IDS order. */
export function allDimensions(): Dimension[] {
  return DIMENSION_IDS.map((id) => world.getDimension(id));
}

/** The dimension, or undefined for an id the world does not know. */
export function dimensionById(id: DimensionId): Dimension | undefined {
  try {
    return world.getDimension(id);
  } catch {
    return undefined;
  }
}
