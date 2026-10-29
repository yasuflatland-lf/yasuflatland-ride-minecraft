import { clamp } from "../shared/vec";

export interface LocalPoint {
  readonly x: number;
  readonly z: number;
}

export interface Footprint {
  readonly halfX: number;
  readonly halfZ: number;
}

export interface TopItem {
  readonly at: LocalPoint;
  readonly footprint: Footprint;
}

export type TopPlacement =
  | { readonly ok: true; readonly at: LocalPoint }
  | { readonly ok: false; readonly reason: "full" | "overlap" | "tooBig" };

export function placeOnTop(
  top: Footprint,
  limit: number,
  existing: readonly TopItem[],
  aim: LocalPoint,
  footprint: Footprint,
): TopPlacement {
  if (existing.length >= limit) return { ok: false, reason: "full" };
  if (footprint.halfX > top.halfX || footprint.halfZ > top.halfZ)
    return { ok: false, reason: "tooBig" };

  const at = {
    x: clamp(aim.x, -top.halfX + footprint.halfX, top.halfX - footprint.halfX),
    z: clamp(aim.z, -top.halfZ + footprint.halfZ, top.halfZ - footprint.halfZ),
  };
  const placed = { at, footprint };
  if (existing.some((item) => overlaps(placed, item)))
    return { ok: false, reason: "overlap" };
  return { ok: true, at };
}

// Strict comparisons let footprints touch along an edge without overlapping.
function overlaps(a: TopItem, b: TopItem): boolean {
  return (
    Math.abs(a.at.x - b.at.x) < a.footprint.halfX + b.footprint.halfX &&
    Math.abs(a.at.z - b.at.z) < a.footprint.halfZ + b.footprint.halfZ
  );
}
