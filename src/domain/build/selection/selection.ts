// A player's two-corner selection in one dimension.
import type { Cell } from "../../shared/cells";
import type { DimensionId } from "../../shared/ids";
import { type Box, boxOf } from "../box";
import type { Corner } from "./corner";

export interface Selection {
  readonly dimensionId: DimensionId;
  readonly pos1?: Cell;
  readonly pos2?: Cell;
}

/** A corner in another dimension starts a new selection holding only that corner. */
export function withCorner(
  sel: Selection | undefined,
  corner: Corner,
  dimensionId: DimensionId,
  cell: Cell,
): Selection {
  const base = sel && sel.dimensionId === dimensionId ? sel : { dimensionId };
  return { ...base, [corner]: cell };
}

export function selectionBox(sel: Selection | undefined): Box | undefined {
  if (!sel?.pos1 || !sel.pos2) return undefined;
  return boxOf(sel.pos1, sel.pos2);
}

/** The only corner of a selection that holds exactly one, else undefined. */
export function loneCorner(sel: Selection | undefined): Cell | undefined {
  if (sel?.pos1 && sel.pos2) return undefined;
  return sel?.pos1 ?? sel?.pos2;
}
