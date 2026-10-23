import { forward, localPoint, rightOf, type Vec3 } from "../../../shared/vec";
import type { CutColumn } from "../../cut";
import type { BladeRule } from "./spec";
export function bladeColumns(
  location: Vec3,
  yaw: number,
  rule: BladeRule,
  flying: boolean,
): CutColumn[] {
  const f = forward(yaw),
    r = rightOf(f);
  const corners = [
    localPoint(location, f, rule.near, -rule.halfWidth),
    localPoint(location, f, rule.near, rule.halfWidth),
    localPoint(location, f, rule.far, -rule.halfWidth),
    localPoint(location, f, rule.far, rule.halfWidth),
  ];
  const minX = Math.min(...corners.map((p) => p.x)),
    maxX = Math.max(...corners.map((p) => p.x)),
    minZ = Math.min(...corners.map((p) => p.z)),
    maxZ = Math.max(...corners.map((p) => p.z));
  // Yaw normalization and projection can round a touching edge to either side of a cell.
  const epsilon =
    Number.EPSILON *
    Math.max(1, Math.abs(location.x), Math.abs(location.z)) *
    16;
  const bottom = Math.floor(location.y + 0.01),
    columns: CutColumn[] = [];
  // Include the cell on either side of an integer boundary: touching counts (ADR 0136).
  for (
    let x = Math.ceil(minX - epsilon) - 1;
    x <= Math.floor(maxX + epsilon);
    x++
  )
    for (
      let z = Math.ceil(minZ - epsilon) - 1;
      z <= Math.floor(maxZ + epsilon);
      z++
    ) {
      const dx = x + 0.5 - location.x,
        dz = z + 0.5 - location.z;
      const ahead = dx * f.x + dz * f.z,
        side = dx * r.x + dz * r.z;
      const forwardRadius = (Math.abs(f.x) + Math.abs(f.z)) / 2,
        sideRadius = (Math.abs(r.x) + Math.abs(r.z)) / 2;
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
        ...(flying
          ? { height: Math.ceil(location.y + rule.bodyHeight) - bottom }
          : {}),
      });
    }
  return columns;
}
