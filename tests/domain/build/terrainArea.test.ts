import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { virtualEndPoint } from "../../../src/domain/build/aim/aim";
import { boxOf, contains } from "../../../src/domain/build/box";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  fillBelowBox,
  fitsTerrainLimit,
  removeAboveBox,
  terrainAreaOf,
  terrainSides,
} from "../../../src/domain/build/terrain/area";
import { isFillable } from "../../../src/domain/build/terrain/fillable";
import type { Cell } from "../../../src/domain/shared/cells";

const areaOf = (a: Cell, b: Cell) => terrainAreaOf(boxOf(a, b), a, b);
const cell = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: -64, max: BUILD_SPEC.worldTopY }),
  z: fc.integer({ min: -100, max: 100 }),
});

describe("terrainAreaOf", () => {
  it("keeps terrain heights in bounds for virtual endpoints and any box", () => {
    fc.assert(
      fc.property(
        cell,
        cell,
        cell,
        fc.integer({ min: -500, max: 500 }),
        (point, a, b, hitY) => {
          const end = virtualEndPoint(
            point,
            {
              origin: { x: point.x - 0.5, y: hitY - 1, z: point.z },
              direction: { x: 1, y: 1, z: 0 },
            },
            BUILD_SPEC.reach,
          );
          expect(end).toBeDefined();
          if (!end) return;
          const area = terrainAreaOf(boxOf(a, b), point, end);
          expect(area.higherY).toBeLessThanOrEqual(BUILD_SPEC.worldTopY);
          expect(area.lowerY).toBeGreaterThanOrEqual(BUILD_SPEC.worldBottomY);
        },
      ),
    );
  });

  it("does not depend on the order of the two points", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        expect(areaOf(a, b)).toEqual(areaOf(b, a));
      }),
    );
  });

  it("spans the x and z extents and orders the two heights", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const area = areaOf(a, b);
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
  it("takes the footprint from the box and the heights from the tapped points", () => {
    fc.assert(
      fc.property(cell, cell, cell, cell, (a, b, c, d) => {
        const box = boxOf(c, d);
        expect(terrainAreaOf(box, a, b)).toEqual({
          minX: box.min.x,
          maxX: box.max.x,
          minZ: box.min.z,
          maxZ: box.max.z,
          lowerY: Math.min(a.y, b.y),
          higherY: Math.max(a.y, b.y),
        });
      }),
    );
  });
});

describe("removeAboveBox", () => {
  it("excludes the floor layer and reaches the world top over the whole footprint", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const area = areaOf(a, b);
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
      removeAboveBox(areaOf({ x: 0, y, z: 0 }, { x: 1, y, z: 1 }));
    expect(at(BUILD_SPEC.worldTopY)).toBeUndefined();
    expect(at(BUILD_SPEC.worldTopY - 1)).toEqual({
      min: { x: 0, y: BUILD_SPEC.worldTopY, z: 0 },
      max: { x: 1, y: BUILD_SPEC.worldTopY, z: 1 },
    });
  });
});

describe("fitsTerrainLimit", () => {
  it("accepts each side up to the limit, inclusive, and ignores height", () => {
    const limit = BUILD_SPEC.maxTerrainSide;
    const side = fc.oneof(
      fc.integer({ min: 1, max: limit * 2 }),
      fc.constantFrom(limit - 1, limit, limit + 1),
    );
    fc.assert(
      fc.property(side, side, cell, (sx, sz, origin) => {
        const to = {
          x: origin.x + sx - 1,
          y: BUILD_SPEC.worldTopY,
          z: origin.z + sz - 1,
        };
        expect(fitsTerrainLimit(areaOf(origin, to))).toBe(
          sx <= BUILD_SPEC.maxTerrainSide && sz <= BUILD_SPEC.maxTerrainSide,
        );
      }),
    );
  });
});

it("spans the selected footprint from the given bottom through the higher tap", () => {
  fc.assert(
    fc.property(cell, cell, cell, cell, cell, (a, b, from, to, bottom) => {
      const footprint = boxOf(a, b);
      const area = terrainAreaOf(footprint, from, to);
      const topY = Math.max(from.y, to.y);
      const bottomY = Math.min(bottom.y, topY);
      expect(fillBelowBox(area, bottomY)).toEqual({
        min: { ...footprint.min, y: bottomY },
        max: { ...footprint.max, y: topY },
      });
    }),
  );
});

it("fills only readable air and fluids that can be edited", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "minecraft:air",
        "minecraft:water",
        "minecraft:flowing_water",
        "minecraft:lava",
        "minecraft:flowing_lava",
      ),
      fc.boolean(),
      (open, editable) => {
        expect(isFillable(open, () => editable)).toBe(editable);
        const unexpectedProtectionCheck = () => {
          throw new Error("Closed or unreadable cells skip protection checks");
        };
        expect(isFillable("minecraft:stone", unexpectedProtectionCheck)).toBe(
          false,
        );
        expect(isFillable(undefined, unexpectedProtectionCheck)).toBe(false);
      },
    ),
  );
});
