import { forward, localPoint, rightOf, type Vec3 } from "../shared/vec";
import type { CutColumn } from "./cut";

/** Blocks along the vehicle's forward axis from its center, where `near` may be negative (behind the center), and the half width across it. */
export interface CutRect {
  readonly near: number;
  readonly far: number;
  readonly halfWidth: number;
}

export function rectCells(
  location: Vec3,
  yaw: number,
  rect: CutRect,
): { x: number; z: number }[] {
  const f = forward(yaw);
  const r = rightOf(f);
  const corners = [
    localPoint(location, f, rect.near, -rect.halfWidth),
    localPoint(location, f, rect.near, rect.halfWidth),
    localPoint(location, f, rect.far, -rect.halfWidth),
    localPoint(location, f, rect.far, rect.halfWidth),
  ];
  const xs = corners.map((p) => p.x);
  const zs = corners.map((p) => p.z);
  // Yaw normalization and projection can round a touching edge to either side of a cell.
  const epsilon =
    Number.EPSILON *
    Math.max(1, Math.abs(location.x), Math.abs(location.z)) *
    16;
  // A unit cell's half extent projected on the rectangle's forward and side axes.
  const forwardRadius = (Math.abs(f.x) + Math.abs(f.z)) / 2;
  const sideRadius = (Math.abs(r.x) + Math.abs(r.z)) / 2;
  const cells: { x: number; z: number }[] = [];
  // Include the cell on either side of an integer boundary: touching counts (ADR 0136).
  const lastX = Math.floor(Math.max(...xs) + epsilon);
  const lastZ = Math.floor(Math.max(...zs) + epsilon);
  for (let x = Math.ceil(Math.min(...xs) - epsilon) - 1; x <= lastX; x++)
    for (let z = Math.ceil(Math.min(...zs) - epsilon) - 1; z <= lastZ; z++) {
      const dx = x + 0.5 - location.x;
      const dz = z + 0.5 - location.z;
      const ahead = dx * f.x + dz * f.z;
      const side = dx * r.x + dz * r.z;
      if (
        ahead + forwardRadius < rect.near - epsilon ||
        ahead - forwardRadius > rect.far + epsilon ||
        side + sideRadius < -rect.halfWidth - epsilon ||
        side - sideRadius > rect.halfWidth + epsilon
      )
        continue;
      cells.push({ x, z });
    }
  return cells;
}

export function boxColumns(
  location: Vec3,
  yaw: number,
  rect: CutRect,
  bottom: number,
  height: number,
): CutColumn[] {
  return rectCells(location, yaw, rect).map((cell) => ({
    ...cell,
    bottom,
    height,
  }));
}
