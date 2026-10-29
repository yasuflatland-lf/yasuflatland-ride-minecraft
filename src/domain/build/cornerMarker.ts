// Selection markers use block boundaries rather than block centers.
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";

/** Points on the unit cube of a block cell: its 8 corners, then the midpoint of each of its 12 edges. */
export function cornerMarkerPoints(cell: Cell): Vec3[] {
  const points: Vec3[] = [];
  const boundaries = [0, 1];
  for (const x of boundaries) {
    for (const y of boundaries) {
      for (const z of boundaries) {
        points.push({ x: cell.x + x, y: cell.y + y, z: cell.z + z });
      }
    }
  }
  for (const axis of ["x", "y", "z"] as const) {
    for (const x of axis === "x" ? [0.5] : boundaries) {
      for (const y of axis === "y" ? [0.5] : boundaries) {
        for (const z of axis === "z" ? [0.5] : boundaries) {
          points.push({ x: cell.x + x, y: cell.y + y, z: cell.z + z });
        }
      }
    }
  }
  return points;
}
