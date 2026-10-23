// Where a vehicle with its headlights on puts light blocks (ADR 0020).
import { type Cell, cellKey } from "../../shared/cells";
import { forward, localPoint, type Vec3 } from "../../shared/vec";
import type { BeamPattern } from "../profile";

export const FULL_LIGHT_LEVEL = 15;
export type LitCell = Cell & { readonly level: number };
export const litCellKey = (c: LitCell): string => `${cellKey(c)}@${c.level}`;

/**
 * Cells ahead of a vehicle at `location` facing `yaw`: the distinct cells
 * reached by each reach and lane in `beams` (pairs that floor to the same
 * block share one cell, at the brighter level), one block above the ground the vehicle stands on.
 */
export function headlightCells(
  location: Vec3,
  yaw: number,
  beams: BeamPattern,
): LitCell[] {
  const f = forward(yaw);
  const y = Math.floor(location.y) + 1;
  const cells = new Map<string, LitCell>();
  for (const [i, reach] of beams.reach.entries()) {
    for (const lane of beams.lanes) {
      const p = localPoint(location, f, reach, lane);
      const c = {
        x: Math.floor(p.x),
        y,
        z: Math.floor(p.z),
        level: beams.levels?.[i] ?? FULL_LIGHT_LEVEL,
      };
      const previous = cells.get(cellKey(c));
      if (previous) c.level = Math.max(previous.level, c.level);
      cells.set(cellKey(c), c);
    }
  }
  return [...cells.values()];
}

/** Which lit cells to clear and which to light to go from `lit` to `wanted`. */
export function relight(
  lit: readonly LitCell[],
  wanted: readonly LitCell[],
): { clear: LitCell[]; light: LitCell[] } {
  const litKeys = new Set(lit.map(litCellKey));
  const wantedKeys = new Set(wanted.map(litCellKey));
  return {
    clear: lit.filter((c) => !wantedKeys.has(litCellKey(c))),
    light: wanted.filter((c) => !litKeys.has(litCellKey(c))),
  };
}
