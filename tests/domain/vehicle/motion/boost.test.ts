import fc from "fast-check";
import { expect, it } from "vitest";
import {
  BoostRule,
  boostedLimits,
  boostedMedium,
  SpeedCeiling,
} from "../../../../src/domain/vehicle/motion/boost";
import { MOTION } from "../../../../src/domain/vehicle/motion/constants";

const speed = fc.double({ min: 0.01, max: 10, noNaN: true });
const scale = fc.double({ min: 1, max: 5, noNaN: true });

it("freezes valid boost rules and rejects invalid flight scales", () => {
  fc.assert(
    fc.property(scale, (flightScale) => {
      const rule = new BoostRule(flightScale);
      expect(rule.flightScale).toBe(flightScale);
      expect(Object.isFrozen(rule)).toBe(true);
    }),
  );
  for (const invalid of [NaN, Infinity, -Infinity, 0.99])
    expect(() => new BoostRule(invalid)).toThrow(RangeError);
});

it("scales only maxSpeed in frozen copies of the limits and air medium", () => {
  const limits = fc.record({
    maxSpeed: speed,
    maxReverse: speed,
    accel: speed,
    reverseAccel: speed,
    brake: speed,
    drag: speed,
    turnRate: speed,
    steerFullSpeed: speed,
    grip: speed,
  });
  const medium = fc.record({ maxSpeed: speed, drag: speed, wallDrag: speed });
  fc.assert(
    fc.property(limits, medium, scale, (normal, air, factor) => {
      const raisedLimits = boostedLimits(Object.freeze(normal), factor);
      const raisedAir = boostedMedium(Object.freeze(air), factor);
      expect(raisedLimits).toStrictEqual({
        ...normal,
        maxSpeed: normal.maxSpeed * factor,
      });
      expect(raisedAir).toStrictEqual({
        ...air,
        maxSpeed: air.maxSpeed * factor,
      });
      expect(Object.isFrozen(raisedLimits)).toBe(true);
      expect(Object.isFrozen(raisedAir)).toBe(true);
    }),
  );
});

it("raises the ceiling immediately and bleeds one step per tick back to normal", () => {
  fc.assert(
    fc.property(speed, scale, (normal, factor) => {
      const ceiling = new SpeedCeiling(normal);
      expect(ceiling.next(false, factor)).toBe(normal);
      expect(ceiling.next(true, factor)).toBe(normal * factor);
      let previous = normal * factor;
      const ticks = Math.ceil((factor - 1) / MOTION.boostBleed);
      for (let tick = 0; tick < ticks; tick++) {
        const next = ceiling.next(false, factor);
        expect(next).toBeLessThanOrEqual(previous);
        expect(next).toBeGreaterThanOrEqual(normal);
        expect(previous - next).toBeCloseTo(
          Math.min(previous - normal, normal * MOTION.boostBleed),
          12,
        );
        previous = next;
      }
      expect(previous).toBeCloseTo(normal, 12);
      expect(ceiling.next(false, factor)).toBe(normal);
      expect(ceiling.next(true, factor)).toBe(normal * factor);
    }),
  );
});

it("lands exactly on normal on the designed twentieth bleed tick", () => {
  const ceiling = new SpeedCeiling(0.9);
  ceiling.next(true, 3);
  for (let tick = 1; tick < 20; tick++)
    expect(ceiling.next(false, 3)).toBeGreaterThan(0.9);
  expect(ceiling.next(false, 3)).toBe(0.9);
});
