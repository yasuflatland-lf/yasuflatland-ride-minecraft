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
    x: Math.min(
      top.halfX - footprint.halfX,
      Math.max(-top.halfX + footprint.halfX, aim.x),
    ),
    z: Math.min(
      top.halfZ - footprint.halfZ,
      Math.max(-top.halfZ + footprint.halfZ, aim.z),
    ),
  };
  if (
    existing.some(
      (item) =>
        Math.abs(at.x - item.at.x) < footprint.halfX + item.footprint.halfX &&
        Math.abs(at.z - item.at.z) < footprint.halfZ + item.footprint.halfZ,
    )
  )
    return { ok: false, reason: "overlap" };
  return { ok: true, at };
}
