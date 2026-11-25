import type { Brand } from "../../shared/ids";
import { distanceXZ, type Vec3 } from "../../shared/vec";

const POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

export type CompassPoint = (typeof POINTS)[number];
export type RoundedDistance = Brand<number, "RoundedDistance">;

export function compassPoint(from: Vec3, to: Vec3): CompassPoint {
  const angle = Math.atan2(to.x - from.x, from.z - to.z);
  const sector = Math.round(angle / (Math.PI / 4));
  return POINTS[(sector + POINTS.length) % POINTS.length] ?? "n";
}

export function roundedDistance(from: Vec3, to: Vec3): RoundedDistance {
  return (Math.round(distanceXZ(from, to) / 10) * 10) as RoundedDistance;
}
