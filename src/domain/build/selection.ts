import type { DimensionId } from "../shared/ids";
import type { BlockState } from "./blockState";
import { type CellBox, cellBox, sizeOf } from "./box";
import { BUILD_SPEC } from "./spec";

export type Selection = Readonly<{
  dimensionId: DimensionId;
  box: CellBox;
  material: BlockState;
}>;

export function selectionOf(
  dimensionId: DimensionId,
  box: CellBox,
  material: BlockState,
): Selection {
  return Object.freeze({
    dimensionId,
    box: cellBox(box.min, box.max),
    material,
  });
}

export function withBox(selection: Selection, box: CellBox): Selection {
  return selectionOf(selection.dimensionId, box, selection.material);
}

export function selectionHeightLimit(box: CellBox): number {
  const { x, z } = sizeOf(box);
  return Math.max(
    1,
    Math.min(
      BUILD_SPEC.worldTopY - box.min.y + 1,
      Math.floor(BUILD_SPEC.maxCopyVolume / (x * z)),
    ),
  );
}

export function inDimension(
  selection: Selection,
  dimensionId: DimensionId,
): boolean {
  return selection.dimensionId === dimensionId;
}
