import fc from "fast-check";
import { expect, it } from "vitest";
import {
  canReachEntrance,
  canSeeEntryHint,
  canStandAtFoot,
  entranceWorld,
} from "../../../src/domain/camp/roofTent/access";
import { exitCell } from "../../../src/domain/camp/roofTent/exitCell";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import type { RoofTentMount } from "../../../src/domain/shared/roofTent";
import { forward, leftOf } from "../../../src/domain/shared/vec";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";

import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
const host = fc.record({
  location: fc.record({ x: coordinate, y: coordinate, z: coordinate }),
  yaw: fc.double({ min: -10000, max: 10000, noNaN: true }),
});
const vehicles = [{ profile: SUV_PROFILE }, { profile: CAMPER_PROFILE }];

it.each(vehicles)(
  "reaches the $profile.kind entrance only at supported heights",
  ({ profile }) => {
    const mount = profile.roofTent as RoofTentMount;
    fc.assert(
      fc.property(host, (host) => {
        const entrance = entranceWorld(mount, host);
        expect(
          canReachEntrance(mount, host, {
            ...entrance,
            y: host.location.y + mount.roofHeight,
          }),
        ).toBe(true);
        expect(
          canReachEntrance(mount, host, {
            ...entrance,
            y: host.location.y,
          }),
        ).toBe(mount.ladder);
        expect(
          canReachEntrance(mount, host, {
            x: entrance.x + ROOF_TENT_SPEC.entranceReach + 1,
            y: host.location.y + mount.roofHeight,
            z: entrance.z,
          }),
        ).toBe(false);
        expect(
          canReachEntrance(mount, host, {
            ...entrance,
            y:
              host.location.y +
              mount.roofHeight +
              ROOF_TENT_SPEC.entranceBand +
              1,
          }),
        ).toBe(false);
      }),
    );
  },
);

it("includes the horizontal and vertical entrance reach boundaries", () => {
  const mount = {
    ...SUV_PROFILE.roofTent,
    entrance: { x: 0, z: 0 },
  } as RoofTentMount;
  const origin = { location: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const entrance = entranceWorld(mount, origin);
  for (const sign of [-1, 1]) {
    const player = {
      x: entrance.x + sign * ROOF_TENT_SPEC.entranceReach,
      y: sign * ROOF_TENT_SPEC.entranceBand,
      z: entrance.z,
    };
    expect(canReachEntrance(mount, origin, player)).toBe(true);
    expect(
      canReachEntrance(mount, origin, {
        ...player,
        x: player.x + sign * 0.01,
      }),
    ).toBe(false);
  }
});

it("keeps the camper entrance outside roof fixtures and its anchor in their gap", () => {
  const mount = CAMPER_PROFILE.roofTent as RoofTentMount;
  for (const fixture of [
    {
      front: CAMPER_SPEC.roofRackFrontZ,
      rear: CAMPER_SPEC.roofRackRearZ,
      halfWidth: CAMPER_SPEC.roofRackHalfWidth,
    },
    {
      front: CAMPER_SPEC.roofVentFrontZ,
      rear: CAMPER_SPEC.roofVentRearZ,
      halfWidth: CAMPER_SPEC.roofVentHalfWidth,
    },
  ]) {
    expect(
      Math.abs(mount.entrance.x) > fixture.halfWidth ||
        mount.entrance.z < fixture.rear ||
        mount.entrance.z > fixture.front,
    ).toBe(true);
  }
  expect(mount.anchor.z).toBeGreaterThan(CAMPER_SPEC.roofRackFrontZ);
  expect(mount.anchor.z).toBeLessThan(CAMPER_SPEC.roofVentRearZ);
});

it.each(vehicles)(
  "starts the $profile.kind exit search in a distinct ground cell farther from the host at any yaw",
  ({ profile }) => {
    const mount = profile.roofTent as RoofTentMount;
    fc.assert(
      fc.property(host, (host) => {
        const entrance = entranceWorld(mount, host);
        const outside = exitCell(mount, host, 0);
        const dx = outside.x - host.location.x;
        const dz = outside.z - host.location.z;
        expect(Math.hypot(dx, dz)).toBeGreaterThan(
          Math.hypot(
            entrance.x - host.location.x,
            entrance.z - host.location.z,
          ),
        );
        expect(outside.y).toBe(Math.floor(host.location.y) || 0);
        expect(Number.isInteger(outside.x) && Number.isInteger(outside.z)).toBe(
          true,
        );
        expect(
          outside.x !== Math.floor(entrance.x) ||
            outside.z !== Math.floor(entrance.z),
        ).toBe(true);
      }),
      { numRuns: 1000 },
    );
  },
);

it.each([-1327.975687162958, 112])(
  "uses a radial search origin even when flooring puts it inside the camper body at yaw %s",
  (yaw) => {
    const host = {
      location: { x: 0, y: 0, z: 0 },
      yaw,
    };
    const mount = CAMPER_PROFILE.roofTent as RoofTentMount;
    const entrance = entranceWorld(mount, host);
    const origin = exitCell(mount, host, 0);
    expect(origin).toEqual({ x: 4, y: 0, z: 0 });
    expect(Math.hypot(origin.x, origin.z)).toBeGreaterThan(
      Math.hypot(entrance.x, entrance.z),
    );
    const f = forward(host.yaw);
    const l = leftOf(f);
    const localX = origin.x * l.x + origin.z * l.z;
    const localZ = origin.x * f.x + origin.z * f.z;
    // Radial distance does not imply rectangular body clearance. The occupant
    // adapter rejects vehicle-space candidates before choosing a teleport cell.
    expect(Math.abs(localX)).toBeLessThan(CAMPER_SPEC.bodyHalfWidth);
    expect(localZ).toBeGreaterThan(-CAMPER_SPEC.bodyRear);
    expect(localZ).toBeLessThan(CAMPER_SPEC.bodyFront);
  },
);

it("activates only ladder feet within the horizontal radius at arbitrary host poses", () => {
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
  fc.assert(
    fc.property(
      host,
      fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      fc.double({
        min: 0,
        max: ROOF_TENT_SPEC.footActivation - 0.001,
        noNaN: true,
      }),
      (host, angle, radius) => {
        const entrance = entranceWorld(mount, host);
        const player = {
          x: entrance.x + Math.cos(angle) * radius,
          z: entrance.z + Math.sin(angle) * radius,
          y: host.location.y,
        };
        expect(canStandAtFoot(mount, host, player)).toBe(true);
        expect(canStandAtFoot({ ...mount, ladder: false }, host, player)).toBe(
          false,
        );
        expect(
          canStandAtFoot(mount, host, {
            ...player,
            x:
              entrance.x +
              Math.cos(angle) * (ROOF_TENT_SPEC.footActivation + 0.001),
            z:
              entrance.z +
              Math.sin(angle) * (ROOF_TENT_SPEC.footActivation + 0.001),
          }),
        ).toBe(false);
      },
    ),
  );
});
it("includes the foot radius and height boundaries but rejects heights beyond the band", () => {
  const mount = {
    ...SUV_PROFILE.roofTent,
    entrance: { x: 0, z: 0 },
  } as RoofTentMount;
  const host = { location: { x: 0, y: 0, z: 0 }, yaw: 0 };
  for (const sign of [-1, 1]) {
    const player = {
      x: ROOF_TENT_SPEC.footActivation,
      y: sign * ROOF_TENT_SPEC.entranceBand,
      z: 0,
    };
    expect(canStandAtFoot(mount, host, player)).toBe(true);
    expect(
      canStandAtFoot(mount, host, { ...player, y: player.y + sign * 0.001 }),
    ).toBe(false);
    expect(
      canStandAtFoot(mount, host, { ...player, x: player.x + 0.001 }),
    ).toBe(false);
  }
});

it("includes foot boundaries at every heading and host pose, allowing only floating-point rounding", () => {
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
  fc.assert(
    fc.property(
      host,
      fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
      (host, heading) => {
        const entrance = entranceWorld(mount, host);
        const radius = ROOF_TENT_SPEC.footActivation;
        const band = ROOF_TENT_SPEC.entranceBand;
        // Translation and trig can round a boundary point a few ulps outward.
        const rounding = 1e-10;
        for (const sign of [-1, 1]) {
          const point = (r: number, height: number) => ({
            x: entrance.x + Math.cos(heading) * r,
            z: entrance.z + Math.sin(heading) * r,
            y: host.location.y + sign * height,
          });
          const boundary = point(radius, band);
          const distance = Math.hypot(
            boundary.x - entrance.x,
            boundary.z - entrance.z,
          );
          const height = Math.abs(boundary.y - host.location.y);
          expect(distance).toBeCloseTo(radius, 10);
          expect(height).toBeCloseTo(band, 10);
          if (!canStandAtFoot(mount, host, boundary)) {
            expect(distance > radius || height > band).toBe(true);
            expect(distance).toBeLessThanOrEqual(radius + rounding);
            expect(height).toBeLessThanOrEqual(band + rounding);
          }
          expect(
            canStandAtFoot(
              mount,
              host,
              point(radius - rounding, band - rounding),
            ),
          ).toBe(true);
          expect(canStandAtFoot(mount, host, point(radius + 0.001, 0))).toBe(
            false,
          );
          expect(canStandAtFoot(mount, host, point(0, band + 0.001))).toBe(
            false,
          );
        }
      },
    ),
    { numRuns: 1000 },
  );
});

it("keeps ladder-foot activation at ground height rather than roof height", () => {
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
  fc.assert(
    fc.property(host, (host) => {
      const entrance = entranceWorld(mount, host);
      expect(
        canStandAtFoot(mount, host, {
          ...entrance,
          y: host.location.y + mount.roofHeight,
        }),
      ).toBe(false);
    }),
  );
});

it("places the SUV foot at least 0.9 blocks beyond its body half width in host-local x", () => {
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
  fc.assert(
    fc.property(host, (host) => {
      const entrance = entranceWorld(mount, host);
      const left = leftOf(forward(host.yaw));
      const localX =
        (entrance.x - host.location.x) * left.x +
        (entrance.z - host.location.z) * left.z;
      expect(localX).toBeCloseTo(mount.entrance.x, 10);
      expect(localX).toBeCloseTo(3.6213106831395345, 10);
      expect(localX - SUV_SPEC.bodyHalfWidth).toBeGreaterThanOrEqual(0.9);
      const front = forward(host.yaw);
      const localZ =
        (entrance.x - host.location.x) * front.x +
        (entrance.z - host.location.z) * front.z;
      expect(localZ).toBeCloseTo(mount.entrance.z, 10);
      expect(localZ).toBeCloseTo(-1.4520148982558139, 10);
      expect(localZ).toBeLessThan(mount.anchor.z);
      expect(mount.entrance.z).toBe(SUV_SPEC.roofTentEntranceZ);
    }),
  );
});

it.each([
  { name: "camper", mount: CAMPER_PROFILE.roofTent as RoofTentMount },
  {
    name: "ground",
    mount: {
      ...SUV_PROFILE.roofTent,
      ladder: false,
      roofHeight: 0,
    } as RoofTentMount,
  },
])("never activates a $name foot even at its entrance", ({ mount }) => {
  fc.assert(
    fc.property(host, coordinate, (host, height) => {
      expect(
        canStandAtFoot(mount, host, {
          ...entranceWorld(mount, host),
          y: host.location.y + height,
        }),
      ).toBe(false);
    }),
  );
});

it("shows the ladder hint beyond foot activation only within ground entrance reach", () => {
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
  fc.assert(
    fc.property(
      host,
      fc.double({ min: 0.8, max: 1.4, noNaN: true }),
      (pose, radius) => {
        const entrance = entranceWorld(mount, pose);
        const player = {
          x: entrance.x + radius,
          y: pose.location.y,
          z: entrance.z,
        };
        expect(canSeeEntryHint(mount, pose, player)).toBe(true);
        expect(canStandAtFoot(mount, pose, player)).toBe(false);
        expect(canSeeEntryHint({ ...mount, ladder: false }, pose, player)).toBe(
          false,
        );
        expect(
          canSeeEntryHint(mount, pose, {
            ...player,
            x: entrance.x + ROOF_TENT_SPEC.entranceReach + 0.001,
          }),
        ).toBe(false);
        for (const sign of [-1, 1]) {
          expect(
            canSeeEntryHint(mount, pose, {
              ...player,
              y: pose.location.y + sign * (ROOF_TENT_SPEC.entranceBand + 0.001),
            }),
          ).toBe(false);
        }
      },
    ),
  );
});
