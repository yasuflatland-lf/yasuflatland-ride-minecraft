import fc from "fast-check";
import { expect, it } from "vitest";
import { TOILET_SPEC } from "../../../src/domain/resort/shows";
import { toiletExit } from "../../../src/domain/resort/toiletExit";
import { cellOf, sameCell } from "../../../src/domain/shared/cells";
import type { Facing4 } from "../../../src/domain/shared/facing";

const coordinate = fc.integer({ min: -100, max: 100 });
const origins = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const facings = fc.constantFrom<Facing4>(0, 90, 180, 270);
const heights = fc.integer({
  min: -TOILET_SPEC.exitSearchDown,
  max: TOILET_SPEC.exitSearchUp,
});

it.each([
  [0, 0, 1],
  [90, -1, 0],
  [180, 0, -1],
  [270, 1, 0],
] as const)(
  "starts in front of the toilet at yaw %i on level ground",
  (facing, dx, dz) => {
    fc.assert(
      fc.property(origins, (origin) => {
        expect(
          toiletExit(cellOf(origin), facing, (feet) => feet.y === origin.y),
        ).toEqual({
          x: origin.x + dx * TOILET_SPEC.exitFrontOffset,
          y: origin.y,
          z: origin.z + dz * TOILET_SPEC.exitFrontOffset,
        });
      }),
    );
  },
);

it("skips the toilet column even when it contains the only safe cell", () => {
  fc.assert(
    fc.property(origins, facings, heights, (origin, facing, dy) => {
      const safe = cellOf({ ...origin, y: origin.y + dy });
      expect(
        toiletExit(cellOf(origin), facing, (feet) => sameCell(feet, safe)),
      ).toBeUndefined();
    }),
  );
});

it("finds the only safe cell beside the toilet at any searchable height", () => {
  fc.assert(
    fc.property(origins, facings, heights, (origin, facing, dy) => {
      const safe = cellOf({ x: origin.x + 1, y: origin.y + dy, z: origin.z });
      expect(
        toiletExit(cellOf(origin), facing, (feet) => sameCell(feet, safe)),
      ).toEqual(safe);
    }),
  );
});

it("returns undefined when there is no safe cell", () => {
  fc.assert(
    fc.property(origins, facings, (origin, facing) => {
      expect(toiletExit(cellOf(origin), facing, () => false)).toBeUndefined();
    }),
  );
});

it.each([
  [{ x: 14, y: 68, z: 25 }, true],
  [{ x: 6, y: 56, z: 17 }, true],
  [{ x: 10, y: 64, z: 26 }, false],
])(
  "checks the search bounds around the front cell for %o",
  (safe, reachable) => {
    const exit = toiletExit(cellOf({ x: 10, y: 64, z: 20 }), 0, (feet) =>
      sameCell(feet, cellOf(safe)),
    );
    expect(exit).toEqual(reachable ? safe : undefined);
  },
);
