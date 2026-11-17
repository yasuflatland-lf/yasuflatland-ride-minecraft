import fc from "fast-check";
import { expect, it } from "vitest";
import {
  leanLevel,
  stepLean,
} from "../../../../../src/domain/vehicle/kinds/scooter/lean";
import { SCOOTER_SPEC as limits } from "../../../../../src/domain/vehicle/kinds/scooter/spec";

const steer = fc.double({ min: -3, max: 3, noNaN: true });
const speed = fc.double({ min: -2, max: 2, noNaN: true });
const angle = fc.double({
  min: -limits.maxLean,
  max: limits.maxLean,
  noNaN: true,
});

it("bounds lean and each tick's change through arbitrary turns", () => {
  fc.assert(
    fc.property(
      fc.array(fc.tuple(steer, speed), { maxLength: 150 }),
      (ticks) => {
        let lean = { angle: 0 };
        for (const [input, velocity] of ticks) {
          const next = stepLean(lean, input, velocity, limits);
          expect(Math.abs(next.angle)).toBeLessThanOrEqual(limits.maxLean);
          expect(Math.abs(next.angle - lean.angle)).toBeLessThanOrEqual(
            limits.leanRate + 1e-12,
          );
          lean = next;
        }
      },
    ),
  );
});
it("decays to upright at rest and stays upright regardless of steering", () => {
  fc.assert(
    fc.property(angle, steer, (initial, input) => {
      let lean = { angle: initial };
      for (
        let tick = 0;
        tick <= Math.ceil(limits.maxLean / limits.leanRate);
        tick++
      )
        lean = stepLean(lean, input, 0, limits);
      expect(lean.angle).toBe(0);
      expect(stepLean(lean, input, 0, limits).angle).toBe(0);
    }),
  );
});
it("leans with steering from upright in either travel direction", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      fc.constantFrom(-1, 1),
      fc.constantFrom(-1, 1),
      (magnitude, turn, travel) => {
        expect(
          Math.sign(
            stepLean({ angle: 0 }, turn, (travel * magnitude) / 100, limits)
              .angle,
          ),
        ).toBe(turn);
      },
    ),
  );
});
it("settles at the speed-scaled and clamped steering target", () => {
  fc.assert(
    fc.property(steer, speed, (input, velocity) => {
      let lean = { angle: 0 };
      for (
        let tick = 0;
        tick <= Math.ceil(limits.maxLean / limits.leanRate);
        tick++
      )
        lean = stepLean(lean, input, velocity, limits);
      expect(lean.angle).toBeCloseTo(
        Math.max(-1, Math.min(1, input)) *
          limits.maxLean *
          Math.min(1, Math.abs(velocity) / limits.leanFullSpeed),
      );
    }),
  );
});
it("quantizes lean into bounded monotone signed levels", () => {
  fc.assert(
    fc.property(
      angle,
      angle,
      fc.integer({ min: 1, max: 12 }),
      (a, b, levels) => {
        const low = leanLevel(
          { angle: Math.min(a, b) },
          levels,
          limits.maxLean,
        );
        const high = leanLevel(
          { angle: Math.max(a, b) },
          levels,
          limits.maxLean,
        );
        expect(Number.isInteger(low)).toBe(true);
        expect(low).toBeGreaterThanOrEqual(-levels);
        expect(high).toBeLessThanOrEqual(levels);
        expect(low).toBeLessThanOrEqual(high);
        expect(leanLevel({ angle: 0 }, levels, limits.maxLean)).toBe(0);
        expect(
          leanLevel({ angle: limits.maxLean }, levels, limits.maxLean),
        ).toBe(levels);
        expect(
          leanLevel({ angle: -limits.maxLean }, levels, limits.maxLean),
        ).toBe(-levels);
      },
    ),
  );
});
