import { forward, localPoint, rightOf, type Vec3 } from "../../../shared/vec";
import type { CutColumn } from "../../cut";
import type { BladeRule } from "./spec";

export function bladeColumns(
  location: Vec3,
  yaw: number,
  rule: BladeRule,
  flying: boolean,
): CutColumn[] {
  const f = forward(yaw);
  const r = rightOf(f);
  const corners = [
    localPoint(location, f, rule.near, -rule.halfWidth),
    localPoint(location, f, rule.near, rule.halfWidth),
    localPoint(location, f, rule.far, -rule.halfWidth),
    localPoint(location, f, rule.far, rule.halfWidth),
  ];
  const xs = corners.map((p) => p.x);
  const zs = corners.map((p) => p.z);
  // Yaw normalization and projection can round a touching edge to either side of a cell.
  const epsilon =
    Number.EPSILON *
    Math.max(1, Math.abs(location.x), Math.abs(location.z)) *
    16;
  // A unit cell's half extent projected on the blade's forward and side axes.
  const forwardRadius = (Math.abs(f.x) + Math.abs(f.z)) / 2;
  const sideRadius = (Math.abs(r.x) + Math.abs(r.z)) / 2;
  // Feet on a partial block (dirt path, farmland, mud, a bottom slab) stand inside
  // that block's row, so a ground cut starts one row up to keep the floor. A
  // hovering body at fractional height still needs the row it sits in (ADR 0136).
  const bottom = flying
    ? Math.floor(location.y + 0.01)
    : Math.ceil(location.y - 0.01);
  const height = flying
    ? Math.ceil(location.y + rule.bodyHeight) - bottom
    : undefined;
  const columns: CutColumn[] = [];
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
        ahead + forwardRadius < rule.near - epsilon ||
        ahead - forwardRadius > rule.far + epsilon ||
        side + sideRadius < -rule.halfWidth - epsilon ||
        side - sideRadius > rule.halfWidth + epsilon
      )
        continue;
      columns.push({
        x,
        z,
        bottom,
        ...(height === undefined ? {} : { height }),
      });
    }
  return columns;
}
