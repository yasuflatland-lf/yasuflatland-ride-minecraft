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
        const out = BUILD_SPEC.markerOutset;
        for (const point of points) {
          let boundaries = 0;
          for (const axis of ["x", "y", "z"] as const) {
            if (
              point[axis] === c[axis] - out ||
              point[axis] === c[axis] + 1 + out
            )
              boundaries++;
            expect(point[axis]).toBeGreaterThanOrEqual(c[axis] - out);
            expect(point[axis]).toBeLessThanOrEqual(c[axis] + 1 + out);
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

  it("orders the corners first, then horizontal edge points, then vertical midpoints", () => {
    const out = BUILD_SPEC.markerOutset;
    const lo = -out;
    const hi = 1 + out;
    const points = cornerMarkerPoints({ x: 0, y: 0, z: 0 });
    expect(points.slice(0, 8)).toEqual([
      { x: lo, y: lo, z: lo },
      { x: lo, y: lo, z: hi },
      { x: lo, y: hi, z: lo },
      { x: lo, y: hi, z: hi },
      { x: hi, y: lo, z: lo },
      { x: hi, y: lo, z: hi },
      { x: hi, y: hi, z: lo },
      { x: hi, y: hi, z: hi },
    ]);
    expect(points.slice(-4)).toEqual([
      { x: lo, y: 0.5, z: lo },
      { x: lo, y: 0.5, z: hi },
      { x: hi, y: 0.5, z: lo },
      { x: hi, y: 0.5, z: hi },
    ]);
  });

  it("keeps every point off the cube's own faces so ground-level cells show it", () => {
    fc.assert(
      fc.property(cell, (c) => {
        for (const point of cornerMarkerPoints(c)) {
          for (const axis of ["x", "y", "z"] as const) {
            expect(point[axis]).not.toBe(c[axis]);
            expect(point[axis]).not.toBe(c[axis] + 1);
          }
        }
      }),
    );
  });
});
