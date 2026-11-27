import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cornerMarkerEdges } from "../../../src/domain/build/cornerMarker";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { add3 } from "../../../src/domain/shared/vec";

const coord = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coord, y: coord, z: coord }).map(cellOf);
const axes = ["x", "y", "z"] as const;

describe("cornerMarkerEdges", () => {
  it("returns the 12 distinct frozen edges of the grown cube", () => {
    fc.assert(
      fc.property(cell, (c) => {
        const edges = cornerMarkerEdges(c);
        expect(edges).toHaveLength(12);
        expect(
          new Set(
            edges.map(({ axis, center }) => JSON.stringify([axis, center])),
          ).size,
        ).toBe(12);
        const out = BUILD_SPEC.markerOutset;
        for (const axis of axes) {
          const parallel = edges.filter((edge) => edge.axis === axis);
          expect(parallel).toHaveLength(4);
          const transverse = axes.filter((coordinate) => coordinate !== axis);
          const lo = -out;
          const hi = 1 + out;
          expect(
            parallel.map(({ center }) =>
              transverse.map(
                (coordinate) => center[coordinate] - c[coordinate],
              ),
            ),
          ).toEqual([
            [lo, lo],
            [lo, hi],
            [hi, lo],
            [hi, hi],
          ]);
          for (const edge of parallel) {
            expect(edge.length).toBe(1.125);
            expect(edge.center[axis]).toBe(c[axis] + 0.5);
            expect(Object.isFrozen(edge)).toBe(true);
          }
        }
      }),
    );
  });

  it("translates every center by the same offset as the cell", () => {
    fc.assert(
      fc.property(cell, cell, (c, offset) => {
        expect(cornerMarkerEdges(cellOf(add3(c, offset)))).toEqual(
          cornerMarkerEdges(c).map((edge) => ({
            ...edge,
            center: add3(edge.center, offset),
          })),
        );
      }),
    );
  });

  it("draws the x edges first, then z, then y", () => {
    const edges = cornerMarkerEdges(cellOf({ x: 0, y: 0, z: 0 }));
    expect(edges.map(({ axis }) => axis)).toEqual([
      "x",
      "x",
      "x",
      "x",
      "z",
      "z",
      "z",
      "z",
      "y",
      "y",
      "y",
      "y",
    ]);
    expect(edges[0]).toEqual({
      center: { x: 0.5, y: -0.0625, z: -0.0625 },
      axis: "x",
      length: 1.125,
    });
  });
});
