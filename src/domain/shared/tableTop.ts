import { LocalFrame } from "./frame";
import { clamp, type Vec2, type Vec3 } from "./vec";

export type LocalPoint = Vec2;

const PIXELS_PER_BLOCK = 16;

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
export function overlaps(a: TopItem, b: TopItem): boolean {
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

/** Host spots are stored in pixels with +x to the left and +z ahead. */
export function hostSpotPoint(
  host: PlacedHost,
  spot: LocalPoint,
  topPx: number,
): Vec3 {
  const offset = new LocalFrame(host.at, host.yaw).toWorldOffset({
    left: spot.x,
    ahead: spot.z,
    up: topPx,
  });
  return {
    x: host.at.x + offset.x / PIXELS_PER_BLOCK,
    y: host.at.y + offset.y / PIXELS_PER_BLOCK,
    z: host.at.z + offset.z / PIXELS_PER_BLOCK,
  };
}

/** The inverse of `hostSpotPoint` on the horizontal plane, in model pixels. */
export function hostLocalPx(host: PlacedHost, point: Vec3): LocalPoint {
  const { left, ahead } = new LocalFrame(host.at, host.yaw).toLocal(point);
  return { x: left * PIXELS_PER_BLOCK, z: ahead * PIXELS_PER_BLOCK };
}
