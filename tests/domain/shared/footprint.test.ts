import fc from "fast-check";
import { expect, it } from "vitest";
import { roofTentCeilingCells } from "../../../src/domain/camp/roofTent/ceiling";
import { cellKey } from "../../../src/domain/shared/cells";
import {
  footprintColumns,
  rectFootprint,
  regularOctagonFootprint,
} from "../../../src/domain/shared/footprint";
import { forward, localOffset } from "../../../src/domain/shared/vec";
import { roofTentCeilingCells as legacyCells } from "./fixtures/legacyRoofTentCeiling";

const coordinate = fc.double({ min: -200, max: 200, noNaN: true });
const origin = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const yaw = fc.double({ min: -360, max: 360, noNaN: true });
const extent = fc.double({ min: 0.1, max: 5, noNaN: true });
const shapes = fc.oneof(
  fc.tuple(extent, extent).map(([a, b]) => rectFootprint(a, b)),
  extent.map(regularOctagonFootprint),
);

it("preserves the original roof tent columns for both variants", () => {
  fc.assert(
    fc.property(origin, yaw, (at, angle) => {
      for (const variant of ["ground", "ladder"] as const) {
        expect(
          new Set(roofTentCeilingCells(at, angle, variant).map(cellKey)),
        ).toEqual(new Set(legacyCells(at, angle, variant).map(cellKey)));
      }
    }),
    { numRuns: 1000 },
  );
});

it("includes interior column centres and stays within the circumradius plus the square radius", () => {
  fc.assert(
    fc.property(
      origin,
      yaw,
      shapes,
      fc.integer({ min: -64, max: 320 }),
      (at, angle, shape, y) => {
        const columns = footprintColumns(at, angle, shape, y);
        const keys = new Set(columns.map(cellKey));
        const radius = Math.max(
          ...shape.corners.map((c) => Math.hypot(c.x, c.z)),
        );
        const f = forward(angle);
        const polygon = shape.corners.map((c) => localOffset(f, c.z, -c.x));
        for (
          let x = Math.floor(at.x - radius);
          x <= Math.ceil(at.x + radius);
          x++
        ) {
          for (
            let z = Math.floor(at.z - radius);
            z <= Math.ceil(at.z + radius);
            z++
          ) {
            const px = x + 0.5 - at.x;
            const pz = z + 0.5 - at.z;
            const inside = polygon.every((a, i) => {
              const b = polygon[(i + 1) % polygon.length];
              if (!b) throw new Error("Missing corner");
              return (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x) >= 0;
            });
            if (inside) expect(keys.has(cellKey({ x, y, z }))).toBe(true);
          }
        }
        expect(keys.size).toBe(columns.length);
        for (const c of columns) {
          expect(c.y).toBe(y);
          expect(
            Math.hypot(c.x + 0.5 - at.x, c.z + 0.5 - at.z),
          ).toBeLessThanOrEqual(radius + Math.SQRT1_2 + 1e-12);
        }
      },
    ),
  );
});

it("constructs regular octagons with the requested apothem and circumradius", () => {
  fc.assert(
    fc.property(extent, (r) => {
      const corners = regularOctagonFootprint(r).corners;
      expect(corners).toHaveLength(8);
      for (const [i, a] of corners.entries()) {
        const b = corners[(i + 1) % corners.length];
        if (!b) throw new Error("Missing corner");
        expect(Math.hypot(a.x, a.z)).toBeCloseTo(r / Math.cos(Math.PI / 8), 12);
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(
          2 * r * Math.tan(Math.PI / 8),
          12,
        );
        expect(a.x * b.z - a.z * b.x).toBeGreaterThan(0);
      }
    }),
  );
});

it("includes columns touching an axis-aligned edge or corner", () => {
  const cells = footprintColumns(
    { x: 0, y: 0, z: 0 },
    0,
    rectFootprint(1, 1),
    5,
  );
  expect(cells).toHaveLength(16);
  expect(cells).toContainEqual({ x: -2, y: 5, z: -2 });
  expect(cells).toContainEqual({ x: 1, y: 5, z: 1 });
});

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid half extents: %s",
  (value) => {
    expect(() => rectFootprint(value, 1)).toThrow(RangeError);
    expect(() => rectFootprint(1, value)).toThrow(RangeError);
    expect(() => regularOctagonFootprint(value)).toThrow(RangeError);
  },
);
