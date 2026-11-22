// Unlike the selection outline, which is drawn at block centers, the endpoint
// marker sits on the block boundary so it surrounds the block (ADR 0183).
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";
import { BUILD_SPEC } from "./spec";

// Points exactly on the boundary of a block that is flush with the ground
// lie in the ground surface and are hidden by it. Pushing them outward keeps
// the marker visible on terrain.
const BOUNDARY_OUTSET = BUILD_SPEC.markerOutset;
const BLOCK_BOUNDARIES = [-BOUNDARY_OUTSET, 1 + BOUNDARY_OUTSET] as const;
const EDGE_MIDPOINT = [0.5] as const;

const horizontalSteps = BUILD_SPEC.markerHorizontalEdgeSteps;
const horizontalInterior = Array.from(
  { length: horizontalSteps - 1 },
  (_, i) => (i + 1) / horizontalSteps,
);

export function cornerMarkerPoints(cell: Cell): Vec3[] {
  return [
    ...pointsOver(cell, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES),
    ...pointsOver(cell, horizontalInterior, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES),
    ...pointsOver(cell, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES, horizontalInterior),
    ...pointsOver(cell, BLOCK_BOUNDARIES, EDGE_MIDPOINT, BLOCK_BOUNDARIES),
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
