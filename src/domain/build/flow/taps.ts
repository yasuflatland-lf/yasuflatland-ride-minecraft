import { cellOf } from "../../shared/cells";
import type { CellBox } from "../box";
import type { Taps } from "./tapCells";

export type { Taps } from "./tapCells";

/** Uses the minimum and maximum corners as the first and second taps. */
export function cornerTaps(box: CellBox): Taps {
  return { from: box.min, to: box.max };
}

/** Rotate moves the footprint while terrain operations keep their two height limits. */
export function tapsForBox(box: CellBox, previousTaps: Taps): Taps {
  const { from, to } = previousTaps;
  return {
    from: cellOf({ ...box.min, y: Math.min(from.y, to.y) }),
    to: cellOf({ ...box.max, y: Math.max(from.y, to.y) }),
  };
}
