import type { Block, Dimension } from "@minecraft/server";
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
