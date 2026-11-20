import type { Dimension } from "@minecraft/server";
import { cellOf } from "../../../domain/shared/cells";
import type { Vec3 } from "../../../domain/shared/vec";

/** Whether the block cell at `at` holds water, including a waterlogged block. */
export function isWaterAt(dimension: Dimension, at: Vec3): boolean {
  try {
    const block = dimension.getBlock(cellOf(at));
    return (
      block !== undefined &&
      (block.typeId === "minecraft:water" ||
        block.typeId === "minecraft:flowing_water" ||
        block.typeId === "minecraft:bubble_column" ||
        block.isWaterlogged)
    );
  } catch {
    return false; // Unloaded chunk or outside the world
  }
}

export function isLavaAt(dimension: Dimension, at: Vec3): boolean {
  try {
    const block = dimension.getBlock(cellOf(at));
    return (
      block?.typeId === "minecraft:lava" ||
      block?.typeId === "minecraft:flowing_lava"
    );
  } catch {
    return false;
  }
}
