import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellKey } from "../../../src/domain/shared/cells";

const coord = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coord, y: coord, z: coord });

describe("cornerMarkerPoints", () => {
  it("returns distinct points on the cube edges", () => {
    fc.assert(
      fc.property(cell, (c) => {
        const points = cornerMarkerPoints(c);
        expect(points).toHaveLength(
          8 + 8 * (BUILD_SPEC.markerHorizontalEdgeSteps - 1) + 4,
        );
        expect(new Set(points.map(cellKey)).size).toBe(points.length);
        for (const point of points) {
          let boundaries = 0;
          for (const axis of ["x", "y", "z"] as const) {
            if (point[axis] === c[axis] || point[axis] === c[axis] + 1)
              boundaries++;
            expect(point[axis]).toBeGreaterThanOrEqual(c[axis]);
            expect(point[axis]).toBeLessThanOrEqual(c[axis] + 1);
          }
          expect(boundaries).toBeGreaterThanOrEqual(2);
        }
      }),
    );
  });

  it("translates every point by the same integer offset as the cell", () => {
    fc.assert(
      fc.property(cell, cell, (c, offset) => {
        expect(
          cornerMarkerPoints({
            x: c.x + offset.x,
            y: c.y + offset.y,
            z: c.z + offset.z,
          }),
        ).toEqual(
          cornerMarkerPoints(c).map((p) => ({
            x: p.x + offset.x,
            y: p.y + offset.y,
            z: p.z + offset.z,
          })),
        );
      }),
    );
  });

  it("orders the origin corners, horizontal edge points and vertical midpoints deterministically", () => {
    expect(cornerMarkerPoints({ x: 0, y: 0, z: 0 })).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 0.25, y: 0, z: 0 },
      { x: 0.25, y: 0, z: 1 },
      { x: 0.25, y: 1, z: 0 },
      { x: 0.25, y: 1, z: 1 },
      { x: 0.5, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 1 },
      { x: 0.5, y: 1, z: 0 },
      { x: 0.5, y: 1, z: 1 },
      { x: 0.75, y: 0, z: 0 },
      { x: 0.75, y: 0, z: 1 },
      { x: 0.75, y: 1, z: 0 },
      { x: 0.75, y: 1, z: 1 },
      { x: 0, y: 0, z: 0.25 },
      { x: 0, y: 0, z: 0.5 },
      { x: 0, y: 0, z: 0.75 },
      { x: 0, y: 1, z: 0.25 },
      { x: 0, y: 1, z: 0.5 },
      { x: 0, y: 1, z: 0.75 },
      { x: 1, y: 0, z: 0.25 },
      { x: 1, y: 0, z: 0.5 },
      { x: 1, y: 0, z: 0.75 },
      { x: 1, y: 1, z: 0.25 },
      { x: 1, y: 1, z: 0.5 },
      { x: 1, y: 1, z: 0.75 },
      { x: 0, y: 0.5, z: 0 },
      { x: 0, y: 0.5, z: 1 },
      { x: 1, y: 0.5, z: 0 },
      { x: 1, y: 0.5, z: 1 },
    ]);
  });
});
