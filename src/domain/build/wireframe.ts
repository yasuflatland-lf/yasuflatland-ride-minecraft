import type { Vec3 } from "../shared/vec";
import { BUILD_SPEC } from "./spec";

/** A path the height-step outline samples; `at` takes t in [0, 1]. */
export interface Curve {
  readonly length: number;
  readonly closed: boolean;
  at(t: number): Vec3;
}

export function line(from: Vec3, to: Vec3): Curve {
  return {
    length: Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z),
    closed: false,
    at: (t) => ({
      x: from.x + t * (to.x - from.x),
      y: from.y + t * (to.y - from.y),
      z: from.z + t * (to.z - from.z),
    }),
  };
}

export function ellipse(
  cx: number,
  y: number,
  cz: number,
  rx: number,
  rz: number,
): Curve {
  return ellipseOn(
    { x: cx, y, z: cz },
    { x: rx, y: 0, z: 0 },
    { x: 0, y: 0, z: rz },
  );
}

export function ellipseOn(center: Vec3, a: Vec3, b: Vec3): Curve {
  const rx = Math.hypot(a.x, a.y, a.z);
  const rz = Math.hypot(b.x, b.y, b.z);
  // Ramanujan's approximation; the outline only needs a sampling density.
  const h = ((rx - rz) / (rx + rz)) ** 2;
  const length =
    rx + rz === 0
      ? 0
      : Math.PI * (rx + rz) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  return {
    length,
    closed: true,
    at: (t) => ({
      x:
        center.x +
        a.x * Math.cos(2 * Math.PI * t) +
        b.x * Math.sin(2 * Math.PI * t),
      y:
        center.y +
        a.y * Math.cos(2 * Math.PI * t) +
        b.y * Math.sin(2 * Math.PI * t),
      z:
        center.z +
        a.z * Math.cos(2 * Math.PI * t) +
        b.z * Math.sin(2 * Math.PI * t),
    }),
  };
}

function wanted(curve: Curve, perBlock: number): number {
  if (curve.length === 0) return 1;
  const spans = Math.ceil(curve.length * perBlock);
  return curve.closed ? Math.max(spans, 1) : Math.max(spans + 1, 2);
}

function sample(curve: Curve, count: number): Vec3[] {
  if (count <= 0) return [];
  if (count === 1) return [curve.at(curve.closed ? 0 : 0.5)];
  const divisor = curve.closed ? count : count - 1;
  return Array.from({ length: count }, (_, i) => curve.at(i / divisor));
}

/** Shares `budget` across the curves in proportion to what they want, by largest remainder. */
function scaled(curves: readonly Curve[], perBlock: number, budget: number) {
  const counts = curves.map((curve) => wanted(curve, perBlock));
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total <= budget) return counts;
  const shares = counts.map((n) => (n * budget) / total);
  const result = shares.map(Math.floor);
  let spare = budget - result.reduce((sum, n) => sum + n, 0);
  const byRemainder = shares
    .map((share, index) => ({ index, rest: share - Math.floor(share) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of byRemainder) {
    if (spare <= 0) break;
    result[index] = (result[index] as number) + 1;
    spare--;
  }
  return result;
}

/**
 * Samples the height-step outline. Horizontal curves (the top and bottom of
 * the shape) are dense so the aimed height reads as a continuous line; the
 * rest are one point per block. Under a tight budget the sparse curves give
 * way first (ADR 0228).
 */
export function outlinePoints(
  horizontal: readonly Curve[],
  other: readonly Curve[],
  maxPoints: number,
): Vec3[] {
  const budget = Math.max(0, Math.floor(maxPoints));
  const denseCounts = scaled(
    horizontal,
    BUILD_SPEC.denseOutlinePerBlock,
    budget,
  );
  const used = denseCounts.reduce((sum, n) => sum + n, 0);
  const otherCounts = scaled(other, 1, budget - used);
  return [
    ...horizontal.flatMap((curve, i) =>
      sample(curve, denseCounts[i] as number),
    ),
    ...other.flatMap((curve, i) => sample(curve, otherCounts[i] as number)),
  ];
}
