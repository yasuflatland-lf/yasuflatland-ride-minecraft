import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, rightOf } from "../../../src/domain/shared/vec";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { BULLDOZER_WIDE_BLADE } from "../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  profileOf,
  RAM_QUERY_RADIUS,
} from "../../../src/domain/vehicle/kinds/index";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import {
  ramHalfWidthLimit,
  type VehicleProfile,
} from "../../../src/domain/vehicle/profile";
import { selectHits } from "../../../src/domain/vehicle/ram";
import { ramQueryRadius } from "../../../src/domain/vehicle/ramQuery";
import { SPEC } from "../../../src/domain/vehicle/spec";

// Mixes in the exact bounds so the far corners, where the sphere is tightest, are drawn often.
const within = (min: number, max: number) =>
  fc.oneof(fc.constantFrom(min, max), fc.double({ min, max, noNaN: true }));

function offsetAt(yawDeg: number, ahead: number, side: number, dy: number) {
  const f = forward(yawDeg);
  const r = rightOf(f);
  return {
    f,
    offset: {
      x: f.x * ahead + r.x * side,
      y: dy,
      z: f.z * ahead + r.z * side,
    },
  };
}

const kindTarget = fc.constantFrom(...VEHICLE_KINDS).chain((kind) => {
  const body = profileOf(kind).body;
  const reach = body.front + SPEC.targetHalfWidth;
  const halfWidth = body.halfWidth + SPEC.targetHalfWidth;
  return fc.record({
    body: fc.constant(body),
    ahead: within(0, reach),
    side: within(-halfWidth, halfWidth),
  });
});

describe("RAM_QUERY_RADIUS", () => {
  it("contains every target that selectHits would hit", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        kindTarget,
        within(SPEC.ramMinDy, SPEC.ramMaxDy),
        fc.boolean(),
        (yawDeg, { body, ahead, side }, dy, reversing) => {
          const speed = reversing ? -SUV_SPEC.maxReverse : SUV_SPEC.maxSpeed;
          const { f, offset } = offsetAt(
            yawDeg,
            reversing ? -ahead : ahead,
            side,
            dy,
          );
          const hits = selectHits(
            f,
            speed,
            [{ id: "t", offset }],
            new Map(),
            0,
            body,
          );
          fc.pre(hits.length === 1);
          expect(Math.hypot(offset.x, offset.y, offset.z)).toBeLessThanOrEqual(
            RAM_QUERY_RADIUS + 1e-9,
          );
        },
      ),
      { numRuns: 2000 },
    );
  });
});

const height = Math.max(Math.abs(SPEC.ramMinDy), Math.abs(SPEC.ramMaxDy));

function cornerReach(front: number, halfWidth: number): number {
  return Math.hypot(
    front + SPEC.targetHalfWidth,
    halfWidth + SPEC.targetHalfWidth,
    height,
  );
}

function withoutCaps(profiles: readonly VehicleProfile[]): VehicleProfile[] {
  return profiles.map((profile) => ({
    ...profile,
    maxRamHalfWidth: undefined,
  }));
}

const profileArb = fc
  .record({
    kind: fc.constantFrom(...VEHICLE_KINDS),
    front: within(0, 20),
    halfWidth: within(0, 20),
    maxRamHalfWidth: fc.option(within(0, 40), { nil: undefined }),
  })
  .map(({ kind, front, halfWidth, maxRamHalfWidth }) => {
    const base = profileOf(kind);
    return {
      ...base,
      body: { ...base.body, front, halfWidth },
      maxRamHalfWidth,
    };
  });

describe("ramQueryRadius", () => {
  const profilesArb = fc.array(profileArb, { minLength: 1, maxLength: 10 });

  it("reaches every profile's corner at its ram half width limit", () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        const radius = ramQueryRadius(profiles);
        for (const profile of profiles) {
          expect(radius).toBeGreaterThanOrEqual(
            cornerReach(profile.body.front, ramHalfWidthLimit(profile)),
          );
        }
      }),
    );
  });

  it("adding a cap never shrinks the query radius", () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        expect(ramQueryRadius(profiles)).toBeGreaterThanOrEqual(
          ramQueryRadius(withoutCaps(profiles)),
        );
      }),
    );
  });

  it("without caps equals the original body-based formula", () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        const uncapped = withoutCaps(profiles);
        expect(ramQueryRadius(uncapped)).toBe(
          Math.max(
            ...uncapped.map(({ body }) =>
              cornerReach(body.front, body.halfWidth),
            ),
          ),
        );
      }),
    );
  });
});

it("reaches the wide bulldozer ram corner", () => {
  expect(RAM_QUERY_RADIUS).toBeGreaterThanOrEqual(
    cornerReach(
      profileOf("bulldozer").body.front,
      BULLDOZER_WIDE_BLADE.halfWidth,
    ),
  );
});
