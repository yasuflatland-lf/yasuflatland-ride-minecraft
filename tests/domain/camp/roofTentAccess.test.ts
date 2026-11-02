import fc from "fast-check";
import { expect, it } from "vitest";
import {
  canReachEntrance,
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
const vehicles = [
  { profile: SUV_PROFILE, spec: SUV_SPEC, rear: SUV_SPEC.bodyFront },
  { profile: CAMPER_PROFILE, spec: CAMPER_SPEC, rear: CAMPER_SPEC.bodyRear },
];

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
  const mount = SUV_PROFILE.roofTent as RoofTentMount;
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
  "exits the $profile.kind onto a distinct ground cell outside its body at any yaw",
  ({ profile, spec, rear }) => {
    const mount = profile.roofTent as RoofTentMount;
    fc.assert(
      fc.property(host, (host) => {
        const entrance = entranceWorld(mount, host);
        const outside = exitCell(mount, host, 0);
        const dx = outside.x - host.location.x;
        const dz = outside.z - host.location.z;
        const f = forward(host.yaw);
        const l = leftOf(f);
        const localX = dx * l.x + dz * l.z;
        const localZ = dx * f.x + dz * f.z;
        expect(
          Math.abs(localX) > spec.bodyHalfWidth ||
            localZ > spec.bodyFront ||
            localZ < -rear,
        ).toBe(true);
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
