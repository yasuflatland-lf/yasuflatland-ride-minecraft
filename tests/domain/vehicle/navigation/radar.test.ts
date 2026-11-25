import fc from "fast-check";
import { expect, it } from "vitest";
import {
  compassPoint,
  roundedDistance,
} from "../../../../src/domain/vehicle/navigation/compass";
import {
  clusterHits,
  RadarMemory,
  type RadarPlace,
} from "../../../../src/domain/vehicle/navigation/radar";
import { SPEC } from "../../../../src/domain/vehicle/spec";

const at = (x = 0, z = 0, y = 0) => ({ x, y, z });
const points = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
const village = (x: number): RadarPlace => ({
  place: "village",
  center: at(x),
});

it("uses eight 45-degree sectors centered on the Minecraft compass points", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 7 }),
      fc.integer({ min: -224, max: 224 }),
      (sector, offset) => {
        const radians = ((sector * 45 + offset / 10) * Math.PI) / 180;
        expect(
          compassPoint(
            at(10, 20),
            at(10 + Math.sin(radians), 20 - Math.cos(radians), 90),
          ),
        ).toBe(points[sector]);
      },
    ),
  );
});

it("reports a multiple of ten within five meters of the horizontal distance", () => {
  const coordinate = fc.integer({ min: -5000, max: 5000 });
  fc.assert(
    fc.property(coordinate, coordinate, coordinate, (x, z, y) => {
      const distance = roundedDistance(at(), at(x, z, y));
      expect(distance % 10).toBe(0);
      expect(Math.abs(distance - Math.sqrt(x * x + z * z))).toBeLessThanOrEqual(
        5,
      );
    }),
  );
});

it("groups a same-type disc while keeping other types separate", () => {
  const offset = fc.integer({ min: -24, max: 24 });
  fc.assert(
    fc.property(
      fc.array(fc.tuple(offset, offset), { minLength: 1 }),
      (offsets) => {
        const locations = [
          at(100, 100, 64),
          ...offsets.map(([x, z]) => at(100 + x, 100 + z, 64)),
        ];
        expect(
          clusterHits([
            ...locations.map((location) => ({
              place: "village" as const,
              location,
            })),
            { place: "witch_hut", location: at(100, 100, 64) },
          ]),
        ).toEqual([
          {
            place: "village",
            center: at(
              locations.reduce((sum, p) => sum + p.x, 0) / locations.length,
              locations.reduce((sum, p) => sum + p.z, 0) / locations.length,
              64,
            ),
          },
          { place: "witch_hut", center: at(100, 100, 64) },
        ]);
      },
    ),
  );
});

it("links neighbors transitively even when the first and last mobs are too far apart", () => {
  fc.assert(
    fc.property(fc.integer({ min: 25, max: 48 }), (gap) => {
      expect(
        clusterHits(
          [0, 2 * gap, gap].map((x) => ({ place: "village", location: at(x) })),
        ),
      ).toEqual([village(gap)]);
    }),
  );
});

it("reports a place once even when its center shifts across a former cell edge", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 300 }),
      fc.integer({ min: 1, max: 24 }),
      (cell, shift) => {
        const edge = cell * SPEC.radarClusterRadius;
        const memory = new RadarMemory();
        memory.offer([village(edge - shift), village(edge + shift)]);
        expect(memory.next(at(edge))?.place).toBe("village");
        expect(memory.next(at(edge))).toBeUndefined();
        memory.offer([village(edge + shift)]);
        expect(memory.next(at(edge))).toBeUndefined();
      },
    ),
  );
});

it("picks the nearest report from the current position and measures it there", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 4 }), (step) => {
      const memory = new RadarMemory();
      memory.offer([village(0), village(100)]);
      expect(memory.next(at(100 - step * 10, 0, 200))).toEqual({
        place: "village",
        direction: "e",
        distance: step * 10,
      });
      expect(memory.next(at(100 - step * 10))?.direction).toBe("w");
    }),
  );
});

it("keeps an out-of-range place pending until it comes within range", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 1000 }), (overshoot) => {
      const memory = new RadarMemory();
      memory.offer([village(SPEC.radarRadius + overshoot)]);
      expect(memory.next(at())).toBeUndefined();
      expect(memory.next(at(overshoot))?.place).toBe("village");
    }),
  );
});
