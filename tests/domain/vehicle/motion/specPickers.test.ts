import fc from "fast-check";
import { expect, it } from "vitest";
import { ticks } from "../../../../src/domain/shared/ticks";
import {
  motionLimitsOf,
  tyreLimitsOf,
} from "../../../../src/domain/vehicle/motion/limits";
import {
  mediumsOf,
  transformingSpecOf,
} from "../../../../src/domain/vehicle/motion/transforming";

const tuning = fc.double({ noNaN: true, noDefaultInfinity: true });
const duration = fc.nat().map(ticks);

it("selects only the ground motion and tyre fields from a kind spec", () => {
  const motion = fc.record({
    maxSpeed: tuning,
    maxReverse: tuning,
    accel: tuning,
    reverseAccel: tuning,
    brake: tuning,
    drag: tuning,
    turnRate: tuning,
    steerFullSpeed: tuning,
    grip: tuning,
  });
  const tyres = fc.record({ handbrakeGrip: tuning, creepSpeed: tuning });

  fc.assert(
    fc.property(motion, tyres, tuning, (motion, tyres, extra) => {
      const spec = { ...motion, ...tyres, extra };
      const motionLimits = motionLimitsOf(spec);
      const tyreLimits = tyreLimitsOf(spec);
      expect(motionLimits).toStrictEqual({ ...motion });
      expect(tyreLimits).toStrictEqual({ ...tyres });
      expect(Object.isFrozen(motionLimits)).toBe(true);
      expect(Object.isFrozen(tyreLimits)).toBe(true);
    }),
  );
});

it("builds the two media and combines them with the transforming fields and policies", () => {
  const transforming = fc.record({
    carHeight: tuning,
    doubleTapTicks: duration,
    takeoffTicks: duration,
    takeoffClimb: tuning,
    landingSink: tuning,
    maxClimb: tuning,
    flightVerticalDrag: tuning,
    waterVerticalDrag: tuning,
    floatDraft: tuning,
    floatGain: tuning,
    surfaceRise: tuning,
    submarineStepProbeDrop: tuning,
    maxBank: tuning,
    bankRate: tuning,
    bankSink: tuning,
    gearDownHeight: tuning,
    gearProbeOffset: tuning,
    hitboxFront: tuning,
    stepLaneOffset: tuning,
  });
  const speedsAndDrag = fc.record({
    maxSpeed: tuning,
    maxWaterSpeed: tuning,
    flightDrag: tuning,
    waterDrag: tuning,
  });
  const policies = fc.record({
    bankEasing: fc.constantFrom("smooth" as const, "constant" as const),
    waterPolicy: fc.constantFrom("surface" as const, "submerge" as const),
  });

  fc.assert(
    fc.property(
      transforming,
      speedsAndDrag,
      policies,
      (values, media, options) => {
        const spec = {
          ...values,
          ...media,
          bankEasing: options.bankEasing === "smooth" ? "constant" : "smooth",
          waterPolicy:
            options.waterPolicy === "surface" ? "submerge" : "surface",
        };
        const mediums = {
          air: { drag: media.flightDrag, maxSpeed: media.maxSpeed },
          water: { drag: media.waterDrag, maxSpeed: media.maxWaterSpeed },
        };
        expect(mediumsOf(spec)).toStrictEqual(mediums);
        const result = transformingSpecOf(spec, options);
        expect(result).toStrictEqual({ ...values, ...mediums, ...options });
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.air)).toBe(true);
        expect(Object.isFrozen(result.water)).toBe(true);
      },
    ),
  );
});
