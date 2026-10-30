import { degToRad, type Vec3 } from "../shared/vec";
import type { Host } from "./hosted";

export type DutchOvenId = string & { readonly __brand: "DutchOvenId" };

export function asDutchOvenId(value: string): DutchOvenId {
  return value as DutchOvenId;
}

/** The host sets only the initial lid state; later presses toggle it (ADR 0191). */
export function initialSimmering(host: Host): boolean {
  return host.kind === "fire_pit";
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
