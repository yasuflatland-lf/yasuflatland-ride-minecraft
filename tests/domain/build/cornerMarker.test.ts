import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import { cellKey } from "../../../src/domain/shared/cells";

const coord = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coord, y: coord, z: coord });

describe("cornerMarkerPoints", () => {
  it("returns 20 distinct points within the block boundaries", () => {
    fc.assert(
      fc.property(cell, (c) => {
        const points = cornerMarkerPoints(c);
        expect(points).toHaveLength(20);
        expect(new Set(points.map(cellKey)).size).toBe(20);
        for (const point of points) {
          for (const axis of ["x", "y", "z"] as const) {
            expect(point[axis]).toBeGreaterThanOrEqual(c[axis]);
            expect(point[axis]).toBeLessThanOrEqual(c[axis] + 1);
          }
        }
      }),
    );
  });

  it("places eight corners before twelve edge midpoints", () => {
    fc.assert(
      fc.property(cell, (c) => {
        const coordinates = cornerMarkerPoints(c).map((p) => [p.x, p.y, p.z]);
        const isCorner = (values: number[]) => values.every(Number.isInteger);
        const isMidpoint = (values: number[]) =>
          values.filter(Number.isInteger).length === 2 &&
          values.filter((v) => v - Math.floor(v) === 0.5).length === 1;
        expect(coordinates.filter(isCorner)).toHaveLength(8);
        expect(coordinates.filter(isMidpoint)).toHaveLength(12);
        expect(coordinates.slice(0, 8).every(isCorner)).toBe(true);
        expect(coordinates.slice(8).every(isMidpoint)).toBe(true);
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

  it("orders the origin cube corners and edge midpoints deterministically", () => {
    expect(cornerMarkerPoints({ x: 0, y: 0, z: 0 })).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 0.5, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 1 },
      { x: 0.5, y: 1, z: 0 },
      { x: 0.5, y: 1, z: 1 },
      { x: 0, y: 0.5, z: 0 },
      { x: 0, y: 0.5, z: 1 },
      { x: 1, y: 0.5, z: 0 },
      { x: 1, y: 0.5, z: 1 },
      { x: 0, y: 0, z: 0.5 },
      { x: 0, y: 1, z: 0.5 },
      { x: 1, y: 0, z: 0.5 },
      { x: 1, y: 1, z: 0.5 },
    ]);
  });
});
