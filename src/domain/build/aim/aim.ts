import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { BUILD_SPEC } from "../spec";

const PLANE_PARALLEL_EPSILON = 1e-6;
const VERTICAL_PARALLEL_EPSILON = 0.999;

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

export function virtualEndPoint(point1: Cell, ray: Ray): Cell | undefined {
  const { origin, direction } = ray;
  const axis = Math.abs(direction.x) >= Math.abs(direction.z) ? "x" : "z";
  if (Math.abs(direction[axis]) < PLANE_PARALLEL_EPSILON) return undefined;
  const t = (point1[axis] + 0.5 - origin[axis]) / direction[axis];
  if (
    t < 0 ||
    t * Math.hypot(direction.x, direction.y, direction.z) > BUILD_SPEC.reach
  ) {
    return undefined;
  }
  return {
    x: Math.floor(origin.x + t * direction.x),
    y: Math.floor(origin.y + t * direction.y),
    z: Math.floor(origin.z + t * direction.z),
    [axis]: point1[axis],
  };
}

export function apexHeight(args: {
  centerX: number;
  centerZ: number;
  baseY: number;
  ray: Ray;
  cap: number;
  previous: number;
  maxY: number;
}): number {
  const { centerX, centerZ, baseY, ray, cap, previous, maxY } = args;
  const max = Math.floor(Math.min(cap, maxY - baseY));
  if (max < 1) return 1;
  const height =
    Math.abs(ray.direction.y) > VERTICAL_PARALLEL_EPSILON
      ? previous
      : rayHeightNearestLine(centerX, centerZ, ray) - baseY;
  return Math.max(1, Math.min(max, Math.round(height)));
}

function rayHeightNearestLine(
  centerX: number,
  centerZ: number,
  ray: Ray,
): number {
  const { origin, direction } = ray;
  // The line can match any y, so closest approach minimizes horizontal distance.
  // Restricting t to nonnegative values keeps the closest point on the ray.
  const t = Math.max(
    0,
    ((centerX - origin.x) * direction.x + (centerZ - origin.z) * direction.z) /
      (direction.x ** 2 + direction.z ** 2),
  );
  return origin.y + t * direction.y;
}
