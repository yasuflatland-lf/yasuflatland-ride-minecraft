// Unlike the selection outline, which is drawn at block centers, the lone-corner
// marker sits on the block boundary so it surrounds the block (ADR 0183).
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";

const BLOCK_BOUNDARIES = [0, 1] as const;
const EDGE_MIDPOINT = [0.5] as const;

/** Points on the unit cube of a block cell: its 8 corners, then the midpoint of each of its 12 edges. */
export function cornerMarkerPoints(cell: Cell): Vec3[] {
  return [
    ...pointsOver(cell, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES),
    ...pointsOver(cell, EDGE_MIDPOINT, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES),
    ...pointsOver(cell, BLOCK_BOUNDARIES, EDGE_MIDPOINT, BLOCK_BOUNDARIES),
    ...pointsOver(cell, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES, EDGE_MIDPOINT),
  ];
}

function pointsOver(
  cell: Cell,
  xs: readonly number[],
  ys: readonly number[],
  zs: readonly number[],
): Vec3[] {
  const points: Vec3[] = [];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        points.push({ x: cell.x + x, y: cell.y + y, z: cell.z + z });
      }
    }
  }
  return points;
}
