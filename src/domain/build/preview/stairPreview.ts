import { cellCenter } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { facingVector } from "../rotation/facing";
import { BUILD_SPEC } from "../spec";
import { goalRowTaps, type Staircase, stairTreads } from "../stairs/staircase";
import { type Curve, evenlyThinnedPoints, line } from "../wireframe";

export function stairPreviewPoints(s: Staircase, maxPoints: number): Vec3[] {
  const direction = facingVector(s.toward);
  const edges: Curve[] = [];
  for (const { start, end, level } of stairTreads(s)) {
    const x0 = s.row.min.x + Math.min(direction.x * start, direction.x * end);
    const x1 =
      s.row.max.x + Math.max(direction.x * start, direction.x * end) + 1;
    const z0 = s.row.min.z + Math.min(direction.z * start, direction.z * end);
    const z1 =
      s.row.max.z + Math.max(direction.z * start, direction.z * end) + 1;
    const y = level + 1;
    const a = { x: x0, y, z: z0 };
    const b = { x: x1, y, z: z0 };
    const c = { x: x1, y, z: z1 };
    const d = { x: x0, y, z: z1 };
    edges.push(line(a, b), line(b, c), line(c, d), line(d, a));
  }
  const { from, to } = goalRowTaps(s);
  edges.push(line(cellCenter(from, 1), cellCenter(to, 1)));
  return evenlyThinnedPoints(edges, BUILD_SPEC.denseOutlinePerBlock, maxPoints);
}
