import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, rightOf } from "../../../src/domain/shared/vec";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  profileOf,
  RAM_QUERY_RADIUS,
} from "../../../src/domain/vehicle/kinds/index";
import { SUV_SPEC } from "../../../src/domain/vehicle/kinds/suv/spec";
import { selectHits } from "../../../src/domain/vehicle/ram";
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
  const body = profileOf(kind).ram;
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
