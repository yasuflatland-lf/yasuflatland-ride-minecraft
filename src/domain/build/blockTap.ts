import type { BlockFace } from "../shared/blockFace";
import type { Cell } from "../shared/cells";
import type { DimensionId } from "../shared/ids";

export type BlockTap = Readonly<{
  dimensionId: DimensionId;
  cell: Cell;
  /** Absent for the invisible tap target (ADR 0257), which has no face. */
  face?: BlockFace;
}>;

export function blockTapOf(
  dimensionId: DimensionId,
  cell: Cell,
  face?: BlockFace,
): BlockTap {
  return Object.freeze(
    face === undefined ? { dimensionId, cell } : { dimensionId, cell, face },
  );
}
