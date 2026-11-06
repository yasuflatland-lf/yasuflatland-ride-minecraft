import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contains } from "../../../src/domain/build/box";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  fitsTerrainLimit,
  removeAboveBox,
  terrainAreaOf,
  terrainSides,
} from "../../../src/domain/build/terrain/area";

const cell = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: -64, max: BUILD_SPEC.worldTopY }),
  z: fc.integer({ min: -100, max: 100 }),
});

describe("terrainAreaOf", () => {
  it("does not depend on the order of the two points", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        expect(terrainAreaOf(a, b)).toEqual(terrainAreaOf(b, a));
      }),
    );
  });

  it("spans the x and z extents and orders the two heights", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const area = terrainAreaOf(a, b);
        expect(area.minX).toBeLessThanOrEqual(area.maxX);
        expect(area.minZ).toBeLessThanOrEqual(area.maxZ);
        expect(area.lowerY).toBe(Math.min(a.y, b.y));
        expect(area.higherY).toBe(Math.max(a.y, b.y));
        expect(terrainSides(area)).toEqual({
          x: Math.abs(a.x - b.x) + 1,
          z: Math.abs(a.z - b.z) + 1,
        });
      }),
    );
  });
});

describe("removeAboveBox", () => {
  it("excludes the floor layer and reaches the world top over the whole footprint", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const area = terrainAreaOf(a, b);
        const box = removeAboveBox(area);
        if (area.lowerY >= BUILD_SPEC.worldTopY) {
          expect(box).toBeUndefined();
          return;
        }
        expect(box).toEqual({
          min: { x: area.minX, y: area.lowerY + 1, z: area.minZ },
          max: { x: area.maxX, y: BUILD_SPEC.worldTopY, z: area.maxZ },
        });
        if (!box) return;
        expect(contains(box, { x: a.x, y: area.lowerY, z: a.z })).toBe(false);
        expect(contains(box, { x: b.x, y: BUILD_SPEC.worldTopY, z: b.z })).toBe(
          true,
        );
      }),
    );
  });

  it("leaves nothing to remove only when the floor is the top layer", () => {
    const at = (y: number) =>
      removeAboveBox(terrainAreaOf({ x: 0, y, z: 0 }, { x: 1, y, z: 1 }));
    expect(at(BUILD_SPEC.worldTopY)).toBeUndefined();
    expect(at(BUILD_SPEC.worldTopY - 1)).toEqual({
      min: { x: 0, y: BUILD_SPEC.worldTopY, z: 0 },
      max: { x: 1, y: BUILD_SPEC.worldTopY, z: 1 },
    });
  });
});

describe("fitsTerrainLimit", () => {
  it("accepts each side up to the limit, inclusive, and ignores height", () => {
    const side = fc.integer({ min: 1, max: BUILD_SPEC.maxTerrainSide * 2 });
    fc.assert(
      fc.property(side, side, cell, (sx, sz, origin) => {
        const to = {
          x: origin.x + sx - 1,
          y: BUILD_SPEC.worldTopY,
          z: origin.z + sz - 1,
        };
        expect(fitsTerrainLimit(terrainAreaOf(origin, to))).toBe(
          sx <= BUILD_SPEC.maxTerrainSide && sz <= BUILD_SPEC.maxTerrainSide,
        );
      }),
    );
  });

  it("holds exactly at the boundary", () => {
    const fits = (sx: number, sz: number) =>
      fitsTerrainLimit(
        terrainAreaOf({ x: 0, y: 0, z: 0 }, { x: sx - 1, y: 0, z: sz - 1 }),
      );
    expect(BUILD_SPEC.maxTerrainSide).toBe(32);
    expect(fits(32, 32)).toBe(true);
    expect(fits(33, 32)).toBe(false);
    expect(fits(32, 33)).toBe(false);
  });
});
