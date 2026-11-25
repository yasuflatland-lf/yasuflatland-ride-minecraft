// Where a vehicle with its headlights on puts light blocks (ADR 0020).
import { type Cell, cellKey, cellOf } from "../../shared/cells";
import { forward, localPoint, type Vec3 } from "../../shared/vec";
import type { SwitchMessages } from "../equipment/equipment";
import type { BeamPattern } from "../profile";

export const HEADLIGHT_MESSAGES: SwitchMessages = Object.freeze({
  messageFor(state: string) {
    if (state === "off") return "headlights_off";
    if (state === "on") return "headlights_on";
    return undefined;
  },
});

export const FULL_LIGHT_LEVEL = 15;
export type LitCell = Cell & { readonly level: number };

/**
 * Cells ahead of a vehicle at `location` facing `yaw`: the distinct cells
 * reached by each reach and lane in `beams` (pairs that floor to the same
 * block share one cell, at the brighter level), one block above the ground
 * the vehicle stands on.
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
    const level = beams.levels?.[i] ?? FULL_LIGHT_LEVEL;
    for (const lane of beams.lanes) {
      const p = localPoint(location, f, reach, lane);
      const c = { x: Math.floor(p.x), y, z: Math.floor(p.z) };
      const key = cellKey(cellOf(c));
      const previous = cells.get(key);
      const brightest = previous ? Math.max(previous.level, level) : level;
      cells.set(key, { ...cellOf(c), level: brightest });
    }
  }
  return [...cells.values()];
}
