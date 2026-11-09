import fc from "fast-check";
import { expect, it } from "vitest";
import { exitCell } from "../../../src/domain/camp/roofTent/exitCell";
import type { Facing4 } from "../../../src/domain/shared/facing";
import { forward, leftOf } from "../../../src/domain/shared/vec";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
const point = fc.record({ x: coordinate, z: coordinate });
const distinctMount = fc.record({
  anchor: point,
  entrance: point,
  roofHeight: coordinate,
  ladder: fc.boolean(),
});
const mount = fc.oneof(
  distinctMount,
  distinctMount.map((mount) => ({ ...mount, anchor: mount.entrance })),
);
const host = fc.record({
  location: fc.record({ x: coordinate, y: coordinate, z: coordinate }),
  yaw: fc.double({ min: -10000, max: 10000, noNaN: true }),
});
const facing = fc.constantFrom<Facing4>(0, 90, 180, 270);

it("places an integer ground cell farther from the host than the entrance for arbitrary mounts and yaws", () => {
  fc.assert(
    fc.property(mount, host, facing, (mount, host, facing) => {
      const f = forward(host.yaw);
      const l = leftOf(f);
      const entrance = {
        x: host.location.x + l.x * mount.entrance.x + f.x * mount.entrance.z,
        z: host.location.z + l.z * mount.entrance.x + f.z * mount.entrance.z,
      };
      const outside = exitCell(mount, host, facing);
      expect(
        Math.hypot(outside.x - host.location.x, outside.z - host.location.z),
      ).toBeGreaterThan(
        Math.hypot(entrance.x - host.location.x, entrance.z - host.location.z),
      );
      expect(outside.y).toBe(Math.floor(host.location.y) || 0);
      expect(
        outside.x !== Math.floor(entrance.x) ||
          outside.z !== Math.floor(entrance.z),
      ).toBe(true);
      for (const value of Object.values(outside)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(Object.is(value, -0)).toBe(false);
      }
    }),
    { numRuns: 1000 },
  );
});

it("uses the facing direction when the entrance equals the anchor", () => {
  fc.assert(
    fc.property(facing, (facing) => {
      const outside = exitCell(
        {
          anchor: { x: 0, z: 0 },
          entrance: { x: 0, z: 0 },
          roofHeight: 2,
          ladder: true,
        },
        { location: { x: 0.5, y: 64.8, z: 0.5 }, yaw: 37 },
        facing,
      );
      const direction = forward(facing);
      expect(
        (outside.x - 0.5) * direction.x + (outside.z - 0.5) * direction.z,
      ).toBeGreaterThan(0);
    }),
  );
});

it("rotates the entrance and its outward direction by the host yaw", () => {
  const mount = {
    anchor: { x: 0, z: 0 },
    entrance: { x: 2, z: 0 },
    roofHeight: 2,
    ladder: true,
  };
  expect(
    exitCell(mount, { location: { x: 0, y: 64.5, z: 0 }, yaw: 0 }, 0),
  ).toEqual({ x: 3, y: 64, z: 0 });
  expect(
    exitCell(mount, { location: { x: 0, y: 64.5, z: 0 }, yaw: 90 }, 0),
  ).toEqual({ x: 0, y: 64, z: 3 });
});
