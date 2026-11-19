import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import {
  bodyRoll,
  rollLevel,
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
const angles = limits.rollLevelAngles;
const roll = fc.double({ min: -90, max: 90, noNaN: true });
it("has ascending roll level angles that cover the ground range and the total roll", () => {
  expect(angles).toHaveLength(5);
  expect(angles.every((a, i) => i === 0 || a > (angles[i - 1] ?? 0))).toBe(
    true,
  );
  expect(
    angles.filter((a) => a <= limits.maxLean).length,
  ).toBeGreaterThanOrEqual(3);
  expect(angles.at(-1)).toBe(limits.maxLean + limits.maxBank);
});
it("quantizes body roll into bounded monotone odd-symmetric levels", () => {
  fc.assert(
    fc.property(roll, roll, (a, b) => {
      const low = rollLevel(Math.min(a, b), angles);
      const high = rollLevel(Math.max(a, b), angles);
      expect(Number.isInteger(low)).toBe(true);
      expect(low).toBeGreaterThanOrEqual(-angles.length);
      expect(high).toBeLessThanOrEqual(angles.length);
      expect(low).toBeLessThanOrEqual(high);
      expect(rollLevel(-a, angles) + rollLevel(a, angles)).toBe(0);
    }),
  );
  expect(rollLevel(0, angles)).toBe(0);
  for (const [index, angle] of angles.entries()) {
    expect(rollLevel(angle, angles)).toBe(index + 1);
    expect(rollLevel(-angle, angles)).toBe(-(index + 1));
  }
  expect(rollLevel((angles.at(-1) ?? 0) + 40, angles)).toBe(angles.length);
  expect(rollLevel(-((angles.at(-1) ?? 0) + 40), angles)).toBe(-angles.length);
  expect(rollLevel(90, angles)).toBe(angles.length);
  expect(rollLevel((angles[0] ?? 0) / 2 - 0.01, angles)).toBe(0);
});
it("takes body roll as lean minus bank, matching the model's lean animation", () => {
  expect(bodyRoll({ angle: 20 }, -30)).toBe(50);
  expect(bodyRoll({ angle: -20 }, 30)).toBe(-50);
  expect(bodyRoll({ angle: 12 }, 0)).toBe(12);
  const model = readFileSync("tools/scooter_anim.py", "utf8");
  expect(model).toContain(
    "query.property('yasu_ride:lean') - query.property('yasu_ride:bank')",
  );
});
