import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  apexHeight,
  type Ray,
  virtualEndPoint,
} from "../../../src/domain/build/aim/aim";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";

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
        fc.record({
          x: coord,
          y: fc.integer({
            min: OVERWORLD_RANGE.minY,
            max: OVERWORLD_RANGE.maxY - 2,
          }),
          z: coord,
        }),
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
            const result = virtualEndPoint(
              cellOf(point),
              ray,
              BUILD_SPEC.reach,
              OVERWORLD_RANGE,
            );
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

  it.each([OVERWORLD_RANGE, NETHER_RANGE])(
    "clamps height while preserving the plane and horizontal intersection in $minY..$maxY",
    (range) => {
      fc.assert(
        fc.property(
          fc.record({
            x: coord,
            y: fc.integer({
              min: range.minY,
              max: range.maxY,
            }),
            z: coord,
          }),
          direction,
          coord,
          fc.integer({ min: 1, max: 60 }),
          (point, d, originY, distance) => {
            const axis = Math.abs(d.x) >= Math.abs(d.z) ? "x" : "z";
            const origin = {
              x: point.x + 0.25 - distance * d.x,
              y: originY,
              z: point.z + 0.25 - distance * d.z,
            };
            origin[axis] = point[axis] + 0.5 - distance * d[axis];
            const ray = { origin, direction: d };
            const result = virtualEndPoint(
              cellOf(point),
              ray,
              BUILD_SPEC.reach,
              range,
            );
            if (!result) return;
            const other = axis === "x" ? "z" : "x";
            const t =
              (point[axis] + 0.5 - ray.origin[axis]) / ray.direction[axis];
            const y = Math.floor(ray.origin.y + t * ray.direction.y);
            expect(result.y).toBeGreaterThanOrEqual(range.minY);
            expect(result.y).toBeLessThanOrEqual(range.maxY);
            expect(result[axis]).toBe(point[axis]);
            expect(result[other]).toBe(
              Math.floor(ray.origin[other] + t * ray.direction[other]),
            );
            expect(result.y).toBe(
              Math.max(range.minY, Math.min(range.maxY, y)),
            );
          },
        ),
      );
    },
  );

  it("rejects intersections behind the origin or beyond reach", () => {
    fc.assert(
      fc.property(
        cell,
        oblique,
        fc.integer({ min: 1, max: 100 }),
        (point, d, extra) => {
          for (const distance of [-extra, BUILD_SPEC.reach + extra]) {
            expect(
              virtualEndPoint(
                cellOf(point),
                {
                  origin: {
                    x: point.x + 0.5 - distance * d.x,
                    y: point.y + 0.5 - distance * d.y,
                    z: point.z + 0.5 - distance * d.z,
                  },
                  direction: d,
                },
                BUILD_SPEC.reach,
                OVERWORLD_RANGE,
              ),
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
            virtualEndPoint(
              cellOf(point),
              {
                origin: point,
                direction: { x, y: Math.sqrt(1 - x * x), z: 0 },
              },
              BUILD_SPEC.reach,
              OVERWORLD_RANGE,
            ),
          ).toBeUndefined();
        },
      ),
    );
  });

  it("accepts an intersection only within the supplied reach in world units", () => {
    fc.assert(
      fc.property(
        cell,
        fc.integer({ min: 1, max: 4 }),
        fc.nat(20),
        coord,
        (point, scale, t, offset) => {
          const direction = { x: 3 * scale, y: 0, z: 4 * scale };
          const y = Math.max(
            OVERWORLD_RANGE.minY,
            Math.min(OVERWORLD_RANGE.maxY, point.y),
          );
          const ray = {
            origin: {
              x: point.x + 0.5 - t * direction.x,
              y,
              z: point.z + 0.5 - t * direction.z,
            },
            direction,
          };
          const distance = t * 5 * scale;
          for (const reach of [
            Math.max(0, distance + offset / 4),
            distance,
            BUILD_SPEC.reach,
          ]) {
            expect(
              virtualEndPoint(cellOf(point), ray, reach, OVERWORLD_RANGE),
            ).toEqual(distance <= reach ? { ...point, y } : undefined);
          }
        },
      ),
    );
  });

  it("includes the reach boundary and breaks horizontal ties toward x", () => {
    expect(
      virtualEndPoint(
        cellOf({ x: 64, y: 0, z: 0 }),
        { origin: { x: 0.5, y: 0.5, z: 0.5 }, direction: { x: 1, y: 0, z: 0 } },
        BUILD_SPEC.reach,
        OVERWORLD_RANGE,
      ),
    ).toEqual({ x: 64, y: 0, z: 0 });
    expect(
      virtualEndPoint(
        cellOf({ x: 2, y: 0, z: 8 }),
        {
          origin: { x: 0, y: 0, z: 0 },
          direction: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
        },
        BUILD_SPEC.reach,
        OVERWORLD_RANGE,
      ),
    ).toEqual({ x: 2, y: 0, z: 2 });
  });
});

describe("apexHeight", () => {
  it("includes the looked-at cell as the top layer within the cap and world limits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: OVERWORLD_RANGE.minY, max: OVERWORLD_RANGE.maxY }),
        fc.nat(299),
        fc.integer({ min: 0, max: 1023 }),
        (baseY, index, fraction) => {
          const k = Math.min(index, OVERWORLD_RANGE.maxY - baseY);
          const lookY = baseY + k + fraction / 1024;
          const height = apexHeight({
            ...defaults,
            baseY,
            ray: {
              origin: { x: -10, y: lookY, z: 0 },
              direction: { x: 1, y: 0, z: 0 },
            },
          });
          expect(height).toBe(k + 1);
          expect(baseY + height - 1).toBe(Math.floor(lookY));
        },
      ),
    );
  });

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

  it("includes the layer at closest approach even when the ray misses the line", () => {
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
          ).toBe(height + 1);
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
    ).toBe(21);
  });
});
