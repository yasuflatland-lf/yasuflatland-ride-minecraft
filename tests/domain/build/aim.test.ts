import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  apexHeight,
  type Ray,
  virtualEndPoint,
} from "../../../src/domain/build/aim/aim";
import { BUILD_SPEC } from "../../../src/domain/build/spec";

const coord = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const direction = cell
  .filter((v) => Math.hypot(v.x, v.y, v.z) > 0)
  .map((v) => {
    const length = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / length, y: v.y / length, z: v.z / length };
  });
const oblique = direction.filter((v) => Math.abs(v.y) < 0.99);
const positive = fc.integer({ min: 1, max: 300 });
const defaults = {
  centerX: 0,
  centerZ: 0,
  baseY: 0,
  cap: 300,
  previous: 7,
  maxY: 320,
};

describe("virtualEndPoint", () => {
  it("floors intersections on the dominant plane, unchanged by horizontal sign flips", () => {
    fc.assert(
      fc.property(
        cell,
        oblique,
        fc.integer({ min: 1, max: 60 }),
        (point, d, distance) => {
          const axis = Math.abs(d.x) >= Math.abs(d.z) ? "x" : "z";
          const other = axis === "x" ? "z" : "x";
          const hit = { x: point.x + 0.5, y: point.y + 2.25, z: point.z + 0.5 };
          hit[other] += 3.25;
          for (const sign of [-1, 1]) {
            const dir = { x: d.x * sign, y: d.y, z: d.z * sign };
            const ray: Ray = {
              origin: {
                x: hit.x - distance * dir.x,
                y: hit.y - distance * dir.y,
                z: hit.z - distance * dir.z,
              },
              direction: dir,
            };
            const result = virtualEndPoint(point, ray);
            expect(result).toEqual({
              x: Math.floor(hit.x),
              y: Math.floor(hit.y),
              z: Math.floor(hit.z),
            });
            expect(result?.[axis]).toBe(point[axis]);
            expect(result?.[other]).not.toBe(point[other]);
          }
        },
      ),
    );
  });

  it("rejects intersections behind the origin or beyond reach", () => {
    fc.assert(
      fc.property(
        cell,
        oblique,
        fc.integer({ min: 1, max: 100 }),
        (point, d, extra) => {
          for (const distance of [-extra, BUILD_SPEC.reach + extra]) {
            expect(
              virtualEndPoint(point, {
                origin: {
                  x: point.x + 0.5 - distance * d.x,
                  y: point.y + 0.5 - distance * d.y,
                  z: point.z + 0.5 - distance * d.z,
                },
                direction: d,
              }),
            ).toBeUndefined();
          }
        },
      ),
    );
  });

  it("rejects rays nearly parallel to both horizontal normals", () => {
    fc.assert(
      fc.property(
        cell,
        fc.double({ min: -1e-7, max: 1e-7, noNaN: true }),
        (point, x) => {
          expect(
            virtualEndPoint(point, {
              origin: point,
              direction: { x, y: Math.sqrt(1 - x * x), z: 0 },
            }),
          ).toBeUndefined();
        },
      ),
    );
  });

  it("includes the reach boundary and breaks horizontal ties toward x", () => {
    expect(
      virtualEndPoint(
        { x: 64, y: 0, z: 0 },
        { origin: { x: 0.5, y: 0.5, z: 0.5 }, direction: { x: 1, y: 0, z: 0 } },
      ),
    ).toEqual({ x: 64, y: 0, z: 0 });
    expect(
      virtualEndPoint(
        { x: 2, y: 0, z: 8 },
        {
          origin: { x: 0, y: 0, z: 0 },
          direction: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
        },
      ),
    ).toEqual({ x: 2, y: 0, z: 2 });
  });
});

describe("apexHeight", () => {
  it("always returns an integer within the cap and world limits, or one when no height fits", () => {
    fc.assert(
      fc.property(
        cell,
        direction,
        coord,
        coord,
        coord,
        coord,
        (origin, d, baseY, cap, maxY, previous) => {
          const result = apexHeight({
            ...defaults,
            baseY,
            cap,
            maxY,
            previous,
            ray: { origin, direction: d },
          });
          expect(Number.isInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(
            Math.max(1, Math.min(cap, maxY - baseY)),
          );
        },
      ),
    );
  });

  it("keeps the previous valid height for vertical and nearly parallel rays in both directions", () => {
    fc.assert(
      fc.property(
        positive,
        cell,
        fc.double({ min: 0.9991, max: 1, noNaN: true }),
        (previous, origin, y) => {
          for (const sign of [-1, 1]) {
            expect(
              apexHeight({
                ...defaults,
                previous,
                ray: {
                  origin,
                  direction: { x: Math.sqrt(1 - y * y), y: sign * y, z: 0 },
                },
              }),
            ).toBe(previous);
          }
        },
      ),
    );
  });

  it("lets either the cap or world height bind independently", () => {
    fc.assert(
      fc.property(positive, positive, coord, (cap, space, baseY) => {
        const ray = {
          origin: { x: 0, y: baseY + 1000, z: 0 },
          direction: { x: 1, y: 0, z: 0 },
        };
        expect(
          apexHeight({ ...defaults, baseY, cap, maxY: baseY + space, ray }),
        ).toBe(Math.min(cap, space));
      }),
    );
  });

  it("finds and rounds the height at closest approach even when the ray misses the line", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 299 }),
        coord,
        fc.integer({ min: 1, max: 50 }),
        fc.constantFrom(0.25, 0.75),
        (height, baseY, distance, fraction) => {
          // The horizontal offset (-6, 8) is perpendicular to (0.48, 0.36).
          const ray: Ray = {
            origin: {
              x: -6 - distance * 0.48,
              y: baseY + height + fraction - distance * 0.8,
              z: 8 - distance * 0.36,
            },
            direction: { x: 0.48, y: 0.8, z: 0.36 },
          };
          expect(
            apexHeight({ ...defaults, baseY, maxY: baseY + 300, ray }),
          ).toBe(Math.round(height + fraction));
        },
      ),
    );
  });

  it("uses the ray origin when the closest point on the infinite line is behind it", () => {
    expect(
      apexHeight({
        ...defaults,
        ray: {
          origin: { x: 10, y: 20, z: 0 },
          direction: { x: 0.6, y: 0.8, z: 0 },
        },
      }),
    ).toBe(20);
  });
});
