import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  SUV_SPEC,
  SUV_TRANSFORMING,
} from "../../../../src/domain/vehicle/kinds/suv/spec";
import { submarineVerticalSpeed } from "../../../../src/domain/vehicle/motion/submarine";
import { waterDepth as depth } from "../../../support/waterDepth";

const finite = (d: number) => (Number.isFinite(d) ? d : 0);
const input = fc.record({
  climb: fc.double(),
  controlled: fc.boolean(),
  rising: fc.boolean(),
  waterDepth: fc.double(),
});

describe("submarineVerticalSpeed", () => {
  it("a controlled finite non-zero climb wins over steps and buoyancy", () => {
    fc.assert(
      fc.property(
        fc
          .double({ noNaN: true, noDefaultInfinity: true })
          .filter((c) => c !== 0),
        fc.boolean(),
        depth,
        (climb, rising, waterDepth) => {
          expect(
            submarineVerticalSpeed(
              {
                climb,
                controlled: true,
                rising,
                waterDepth,
              },
              SUV_TRANSFORMING,
            ),
          ).toBe(Math.max(-1, Math.min(1, climb)) * SUV_SPEC.maxClimb);
        },
      ),
    );
  });

  it("a step rises fully when there is no controlled climb", () => {
    fc.assert(
      fc.property(input, (i) => {
        const climb = i.controlled ? 0 : i.climb;
        expect(
          submarineVerticalSpeed(
            { ...i, climb, rising: true },
            SUV_TRANSFORMING,
          ),
        ).toBe(SUV_SPEC.maxClimb);
      }),
    );
  });

  it("controlled buoyancy only sinks above the float line and otherwise holds depth", () => {
    fc.assert(
      fc.property(depth, (waterDepth) => {
        const speed = submarineVerticalSpeed(
          {
            climb: 0,
            controlled: true,
            rising: false,
            waterDepth,
          },
          SUV_TRANSFORMING,
        );
        const d = finite(waterDepth);
        expect(speed).toBeLessThanOrEqual(0);
        expect(speed < 0).toBe(d < SUV_SPEC.floatDraft);
        if (d >= SUV_SPEC.floatDraft) expect(speed).toBe(0);
      }),
    );
  });

  it("uncontrolled buoyancy returns toward the float line", () => {
    fc.assert(
      fc.property(depth, fc.double(), (waterDepth, climb) => {
        const speed = submarineVerticalSpeed(
          {
            climb,
            controlled: false,
            rising: false,
            waterDepth,
          },
          SUV_TRANSFORMING,
        );
        const d = finite(waterDepth);
        expect(speed > 0).toBe(d > SUV_SPEC.floatDraft);
        expect(speed < 0).toBe(d < SUV_SPEC.floatDraft);
        expect(speed).toBeCloseTo(
          Math.max(
            -SUV_SPEC.surfaceRise,
            Math.min(
              SUV_SPEC.surfaceRise,
              (d - SUV_SPEC.floatDraft) * SUV_SPEC.floatGain,
            ),
          ),
          12,
        );
      }),
    );
    for (const controlled of [true, false]) {
      expect(
        submarineVerticalSpeed(
          {
            climb: 0,
            controlled,
            rising: false,
            waterDepth: SUV_SPEC.floatDraft,
          },
          SUV_TRANSFORMING,
        ),
      ).toBe(0);
    }
  });

  it("is continuous across the float line", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.001, max: 0.001, noNaN: true }),
        fc.boolean(),
        (delta, controlled) => {
          const speed = submarineVerticalSpeed(
            {
              climb: 0,
              controlled,
              rising: false,
              waterDepth: SUV_SPEC.floatDraft + delta,
            },
            SUV_TRANSFORMING,
          );
          expect(Math.abs(speed)).toBeLessThanOrEqual(
            (Math.abs(delta) + Number.EPSILON) * SUV_SPEC.floatGain,
          );
        },
      ),
    );
  });

  it("always produces a finite speed within maxClimb", () => {
    fc.assert(
      fc.property(input, (i) => {
        const speed = submarineVerticalSpeed(i, SUV_TRANSFORMING);
        expect(Number.isFinite(speed)).toBe(true);
        expect(Math.abs(speed)).toBeLessThanOrEqual(SUV_SPEC.maxClimb);
      }),
    );
  });

  it("treats non-finite climbs as no command and non-finite depths as dry", () => {
    for (const climb of [NaN, Infinity, -Infinity])
      for (const waterDepth of [NaN, Infinity, -Infinity])
        for (const controlled of [true, false])
          for (const rising of [true, false]) {
            expect(
              submarineVerticalSpeed(
                { climb, waterDepth, controlled, rising },
                SUV_TRANSFORMING,
              ),
            ).toBe(rising ? SUV_SPEC.maxClimb : -SUV_SPEC.surfaceRise);
          }
  });
});

describe("per-kind submarine climb", () => {
  it("rises at the supplied maxClimb over a step without control", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        input,
        (maxClimb, input) => {
          const spec = { ...SUV_TRANSFORMING, maxClimb };
          expect(
            submarineVerticalSpeed(
              { ...input, controlled: false, rising: true },
              spec,
            ),
          ).toBe(spec.maxClimb);
        },
      ),
    );
  });

  it("scales a controlled climb by the supplied maxClimb", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc
          .double({ noNaN: true, noDefaultInfinity: true })
          .filter((c) => c !== 0),
        input,
        (maxClimb, climb, input) => {
          const spec = { ...SUV_TRANSFORMING, maxClimb };
          expect(
            submarineVerticalSpeed({ ...input, climb, controlled: true }, spec),
          ).toBe(Math.max(-1, Math.min(1, climb)) * maxClimb);
        },
      ),
    );
  });

  it("floats toward the supplied float line at the supplied gain, capped by surfaceRise", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 3, noNaN: true }),
        fc.double({ min: 0.01, max: 2, noNaN: true }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.boolean(),
        depth,
        (floatDraft, floatGain, surfaceRise, controlled, waterDepth) => {
          const spec = {
            ...SUV_TRANSFORMING,
            floatDraft,
            floatGain,
            surfaceRise,
          };
          const pull = Math.max(
            -surfaceRise,
            Math.min(
              surfaceRise,
              (finite(waterDepth) - floatDraft) * floatGain,
            ),
          );
          expect(
            submarineVerticalSpeed(
              { climb: 0, controlled, rising: false, waterDepth },
              spec,
            ),
          ).toBe(controlled ? Math.min(0, pull) : pull);
        },
      ),
    );
  });

  it("holds still exactly at the supplied float line", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 3, noNaN: true }),
        fc.boolean(),
        (floatDraft, controlled) => {
          const spec = { ...SUV_TRANSFORMING, floatDraft };
          expect(
            submarineVerticalSpeed(
              { climb: 0, controlled, rising: false, waterDepth: floatDraft },
              spec,
            ),
          ).toBe(0);
        },
      ),
    );
  });
});
