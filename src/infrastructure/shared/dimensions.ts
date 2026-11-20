import { type Dimension, world } from "@minecraft/server";

export const DIMENSION_IDS = ["overworld", "nether", "the_end"] as const;

/** Every dimension, in DIMENSION_IDS order. */
export function allDimensions(): Dimension[] {
  return DIMENSION_IDS.map((id) => world.getDimension(id));
}
