import type { CellBox } from "../box";
import type { BuildFlow } from "./state";
import type { Taps } from "./tapCells";

export type { Taps } from "./tapCells";

/** Selected and terrain confirmation flows keep their taps for terrain heights and Cancel. */
export function tapsOf(flow: BuildFlow): Taps | undefined {
  if (flow.kind === "selected" || flow.kind === "terrainConfirm")
    return { from: flow.from, to: flow.to };
}

/** Uses the minimum and maximum corners as the first and second taps. */
export function cornerTaps(box: CellBox): Taps {
  return { from: box.min, to: box.max };
}

/** Rotate moves the footprint while terrain operations keep their two height limits. */
export function tapsForBox(box: CellBox, previousTaps: Taps): Taps {
  const { from, to } = previousTaps;
  return {
    from: { ...box.min, y: Math.min(from.y, to.y) },
    to: { ...box.max, y: Math.max(from.y, to.y) },
  };
}
