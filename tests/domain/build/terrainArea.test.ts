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
import { type Cell, cellOf } from "../../../src/domain/shared/cells";

import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";

const areaOf = (a: Cell, b: Cell) => terrainAreaOf(boxOf(a, b), a, b);
const cell = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: OVERWORLD_RANGE.minY, max: OVERWORLD_RANGE.maxY }),
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
            cellOf(point),
            {
              origin: { x: point.x - 0.5, y: hitY - 1, z: point.z },
              direction: { x: 1, y: 1, z: 0 },
            },
            BUILD_SPEC.reach,
            OVERWORLD_RANGE,
          );
          expect(end).toBeDefined();
          if (!end) return;
          const area = terrainAreaOf(
            boxOf(cellOf(a), cellOf(b)),
            cellOf(point),
            end,
          );
          expect(area.higherY).toBeLessThanOrEqual(OVERWORLD_RANGE.maxY);
          expect(area.lowerY).toBeGreaterThanOrEqual(OVERWORLD_RANGE.minY);
        },
      ),
    );
  });

  it("does not depend on the order of the two points", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        expect(areaOf(cellOf(a), cellOf(b))).toEqual(
          areaOf(cellOf(b), cellOf(a)),
        );
      }),
    );
  });

  it("spans the x and z extents and orders the two heights", () => {
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const area = areaOf(cellOf(a), cellOf(b));
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
        const box = boxOf(cellOf(c), cellOf(d));
        expect(terrainAreaOf(box, cellOf(a), cellOf(b))).toEqual({
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
      fc.property(
        cell,
        cell,
        fc.constantFrom(OVERWORLD_RANGE, NETHER_RANGE),
        (a, b, range) => {
          const area = areaOf(cellOf(a), cellOf(b));
          const box = removeAboveBox(area, range);
          if (area.lowerY >= range.maxY) {
            expect(box).toBeUndefined();
            return;
          }
          expect(box).toEqual({
            min: { x: area.minX, y: area.lowerY + 1, z: area.minZ },
            max: { x: area.maxX, y: range.maxY, z: area.maxZ },
          });
          if (!box) return;
          expect(
            contains(box, cellOf({ x: a.x, y: area.lowerY, z: a.z })),
          ).toBe(false);
          expect(contains(box, cellOf({ x: b.x, y: range.maxY, z: b.z }))).toBe(
            true,
          );
        },
      ),
    );
  });

  it("leaves nothing to remove only when the floor is the top layer", () => {
    const at = (y: number) =>
      removeAboveBox(
        areaOf(cellOf({ x: 0, y, z: 0 }), cellOf({ x: 1, y, z: 1 })),
        OVERWORLD_RANGE,
      );
    expect(at(OVERWORLD_RANGE.maxY)).toBeUndefined();
    expect(at(OVERWORLD_RANGE.maxY - 1)).toEqual({
      min: { x: 0, y: OVERWORLD_RANGE.maxY, z: 0 },
      max: { x: 1, y: OVERWORLD_RANGE.maxY, z: 1 },
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
        const to = cellOf({
          x: origin.x + sx - 1,
          y: OVERWORLD_RANGE.maxY,
          z: origin.z + sz - 1,
        });
        expect(fitsTerrainLimit(areaOf(cellOf(origin), to))).toBe(
          sx <= BUILD_SPEC.maxTerrainSide && sz <= BUILD_SPEC.maxTerrainSide,
        );
      }),
    );
  });
});

it("spans the selected footprint from the given bottom through the higher tap", () => {
  fc.assert(
    fc.property(cell, cell, cell, cell, cell, (a, b, from, to, bottom) => {
      const footprint = boxOf(cellOf(a), cellOf(b));
      const area = terrainAreaOf(footprint, cellOf(from), cellOf(to));
      const topY = Math.max(from.y, to.y);
      const bottomY = Math.min(bottom.y, topY);
      expect(
        fillBelowBox(area, { minY: bottomY, maxY: OVERWORLD_RANGE.maxY }),
      ).toEqual({
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
