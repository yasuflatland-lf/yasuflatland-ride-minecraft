import fc from "fast-check";
import { expect, it } from "vitest";
import { SPORTSBOAT_SPEC } from "../../../../../src/domain/vehicle/kinds/sportsboat/spec";
import { surfaceLift } from "../../../../../src/domain/vehicle/kinds/sportsboat/surfacing";

const { maxDepth, maxLift } = SPORTSBOAT_SPEC.icebreaker.surfacing;
const depth = fc.double({ min: 0, max: 10, noNaN: true });

it("is zero at or below the maximum depth", () => {
  fc.assert(
    fc.property(fc.double({ min: -5, max: maxDepth, noNaN: true }), (d) => {
      expect(surfaceLift(d)).toBe(0);
    }),
  );
});

it("is non-decreasing and bounded by the maximum lift", () => {
  fc.assert(
    fc.property(depth, depth, (a, b) => {
      const [low, high] = a <= b ? [a, b] : [b, a];
      expect(surfaceLift(low)).toBeLessThanOrEqual(surfaceLift(high));
      expect(surfaceLift(high)).toBeLessThanOrEqual(maxLift);
      expect(surfaceLift(high)).toBeGreaterThanOrEqual(0);
    }),
  );
});

it("is continuous at the maximum depth and positive just above it", () => {
  fc.assert(
    fc.property(fc.double({ min: 1e-6, max: 0.01, noNaN: true }), (e) => {
      expect(surfaceLift(maxDepth + e)).toBeGreaterThan(0);
      expect(surfaceLift(maxDepth + e)).toBeLessThan(0.01);
    }),
  );
});
