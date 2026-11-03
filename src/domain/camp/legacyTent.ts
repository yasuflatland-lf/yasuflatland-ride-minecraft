import type { Cell } from "../shared/cells";
import { type TentPose, tentCellAt } from "./tent";

// Layout 1's footprint for cleanup only; no legacy cell layout is retained.
export const LEGACY_CLEAR_BOX = Object.freeze({
  halfWidth: 3,
  depth: 12,
  layers: 4,
});

export function legacyTentClearCells(pose: TentPose): Cell[] {
  const cells: Cell[] = [];
  for (
    let x = -LEGACY_CLEAR_BOX.halfWidth;
    x <= LEGACY_CLEAR_BOX.halfWidth;
    x++
  )
    for (let depth = 0; depth < LEGACY_CLEAR_BOX.depth; depth++)
      for (let layer = 0; layer < LEGACY_CLEAR_BOX.layers; layer++)
        cells.push(tentCellAt(pose, { x, depth, layer }));
  return cells;
}

export function isTentBlockTypeId(typeId: string | undefined): boolean {
  return typeId?.startsWith("yasu_ride:tent_") === true;
}
