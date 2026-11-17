import fc from "fast-check";
import { expect, it } from "vitest";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { surfaceHold } from "../../../../src/domain/vehicle/motion/surface";

const spec = SUV_TRANSFORMING;
const wet = fc.oneof(
  fc.double({ min: Number.EPSILON, max: spec.carHeight + 10, noNaN: true }),
  fc.constantFrom(spec.floatDraft, spec.carHeight, spec.floatDraft / 2),
);
const velocity = fc.double({ min: -2, max: 2, noNaN: true });

it("bounds wet surface targets and rises exactly below the float line", () => {
  fc.assert(
    fc.property(wet, velocity, (depth, vy) => {
      const target = surfaceHold(depth, spec.carHeight, vy, spec);
      expect(target).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThanOrEqual(spec.surfaceRise);
      if (depth > spec.floatDraft) expect(target).toBeGreaterThan(0);
      else expect(target).toBe(0);
      if (depth >= spec.carHeight) expect(target).toBe(spec.surfaceRise);
    }),
  );
});

it("leaves vertical velocity alone when dry or depth is not finite", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.double({ max: 0, noNaN: true }),
        fc.constantFrom(Number.NaN, Infinity, -Infinity),
      ),
      velocity,
      (depth, vy) => {
        expect(surfaceHold(depth, spec.carHeight, vy, spec)).toBe(vy);
      },
    ),
  );
});

it("converges from below the surface to the float line without going dry", () => {
  fc.assert(
    fc.property(
      fc.double({
        min: spec.floatDraft,
        max: spec.carHeight + 10,
        noNaN: true,
      }),
      (start) => {
        let depth = start;
        for (let tick = 0; tick < 1000; tick++) {
          const vy = surfaceHold(depth, spec.carHeight, 0, spec);
          depth -= vy;
          expect(depth).toBeGreaterThan(0);
          expect(depth).toBeGreaterThanOrEqual(spec.floatDraft - 1e-12);
        }
        expect(depth).toBeCloseTo(spec.floatDraft, 10);
      },
    ),
  );
});

it("uses proportional lift between the float line and full rise", () => {
  fc.assert(
    fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (fraction) => {
      const depth =
        spec.floatDraft +
        fraction *
          Math.min(
            spec.surfaceRise / spec.floatGain,
            (spec.carHeight - spec.floatDraft) / 2,
          );
      expect(surfaceHold(depth, spec.carHeight, 0, spec)).toBeCloseTo(
        (depth - spec.floatDraft) * spec.floatGain,
        12,
      );
    }),
  );
});
