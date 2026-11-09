import { clamp, degToRad, type Vec3 } from "./vec";

export interface LocalPoint {
  readonly x: number;
  readonly z: number;
}

export interface TopRect {
  readonly halfX: number;
  readonly halfZ: number;
}

export interface TopItem {
  readonly at: LocalPoint;
  readonly footprint: TopRect;
}

export type TopPlacement =
  | { readonly ok: true; readonly at: LocalPoint }
  | { readonly ok: false; readonly reason: "full" | "overlap" | "tooBig" };

export function placeOnTop(
  top: TopRect,
  limit: number,
  existing: readonly TopItem[],
  aim: LocalPoint,
  footprint: TopRect,
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

export interface TopSurface {
  readonly half: TopRect;
  readonly topPx: number;
  readonly limit: number;
  readonly clearanceBase: 0 | 1;
}

export function aimOnPlane(
  head: Vec3,
  dir: Vec3,
  planeY: number,
): Vec3 | undefined {
  if (dir.y === 0) return undefined;
  const t = (planeY - head.y) / dir.y;
  if (t < 0) return undefined;
  return { x: head.x + dir.x * t, y: planeY, z: head.z + dir.z * t };
}

interface PlacedHost {
  readonly at: Vec3;
  readonly yaw: number;
}

/** The world point of a host spot given in model pixels, on a top `topPx` up. */
export function hostSpotPoint(
  host: PlacedHost,
  spot: { x: number; z: number },
  topPx: number,
): Vec3 {
  const angle = degToRad(host.yaw);
  return {
    x: host.at.x + (spot.x * Math.cos(angle) - spot.z * Math.sin(angle)) / 16,
    y: host.at.y + topPx / 16,
    z: host.at.z + (spot.x * Math.sin(angle) + spot.z * Math.cos(angle)) / 16,
  };
}

/** The inverse of `hostSpotPoint` on the horizontal plane, in model pixels. */
export function hostLocalPx(
  host: PlacedHost,
  point: Vec3,
): { x: number; z: number } {
  const angle = degToRad(host.yaw);
  const dx = point.x - host.at.x;
  const dz = point.z - host.at.z;
  return {
    x: (dx * Math.cos(angle) + dz * Math.sin(angle)) * 16,
    z: (-dx * Math.sin(angle) + dz * Math.cos(angle)) * 16,
  };
}
