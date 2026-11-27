// Unlike the selection outline, which is drawn at block centers, the endpoint
// marker sits on the block boundary so it surrounds the block (ADR 0183).
import type { Cell } from "../shared/cells";
import type { Vec3 } from "../shared/vec";
import { BUILD_SPEC } from "./spec";

// Edges exactly on the boundary of a block that is flush with the ground
// lie in the ground surface and are hidden by it. Pushing them outward keeps
// the marker visible on terrain.
const BOUNDARY_OUTSET = BUILD_SPEC.markerOutset;
const BLOCK_BOUNDARIES = [-BOUNDARY_OUTSET, 1 + BOUNDARY_OUTSET] as const;
const EDGE_MIDPOINT = [0.5] as const;

const EDGE_LENGTH = 1 + 2 * BOUNDARY_OUTSET;

export type MarkerAxis = "x" | "y" | "z";

/** One edge of an endpoint marker cube. */
export interface MarkerEdge {
  readonly center: Vec3;
  readonly axis: MarkerAxis;
  readonly length: number; // blocks
}

export function cornerMarkerEdges(cell: Cell): MarkerEdge[] {
  // Draw both horizontal squares first in case spawning stops early.
  return [
    ...edgesOver(cell, "x", EDGE_MIDPOINT, BLOCK_BOUNDARIES, BLOCK_BOUNDARIES),
    ...edgesOver(cell, "z", BLOCK_BOUNDARIES, BLOCK_BOUNDARIES, EDGE_MIDPOINT),
    ...edgesOver(cell, "y", BLOCK_BOUNDARIES, EDGE_MIDPOINT, BLOCK_BOUNDARIES),
  ];
}

function edgesOver(
  cell: Cell,
  axis: MarkerAxis,
  xs: readonly number[],
  ys: readonly number[],
  zs: readonly number[],
): MarkerEdge[] {
  const edges: MarkerEdge[] = [];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const center = Object.freeze({
          x: cell.x + x,
          y: cell.y + y,
          z: cell.z + z,
        });
        edges.push(Object.freeze({ center, axis, length: EDGE_LENGTH }));
      }
    }
  }
  return edges;
}
