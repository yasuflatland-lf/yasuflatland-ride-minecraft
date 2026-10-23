import fc from "fast-check";
import { expect, it } from "vitest";
import { BULLDOZER_SPEC } from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  advanceTracks,
  trackPhase,
  trackSpin,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/tracks";

const g = BULLDOZER_SPEC.tracks;
const n = fc.double({ min: -1000, max: 1000, noNaN: true });
it("runs both tracks by the speed when driving straight", () =>
  fc.assert(
    fc.property(n, n, n, (r, l, s) => {
      const t = advanceTracks({ r, l }, s, 0, g);
      expect(t.r).toBeCloseTo(r + s, 9);
      expect(t.l).toBeCloseTo(l + s, 9);
    }),
  ));
it("runs the tracks opposite ways on a pivot", () =>
  fc.assert(
    fc.property(n, (d) => {
      const t = advanceTracks({ r: 0, l: 0 }, 0, d, g);
      expect(t.r).toBeCloseTo(((-d * Math.PI) / 180) * g.halfGauge, 9);
      expect(t.l).toBeCloseTo(-t.r, 9);
    }),
  ));
it("repeats the grouser phase every three phase steps", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -10000, max: 10000 }),
      fc.integer({ min: -100, max: 100 }),
      (a, b) => {
        expect(trackPhase((a + 0.5 + 3 * b) * g.phaseStep, g.phaseStep)).toBe(
          trackPhase((a + 0.5) * g.phaseStep, g.phaseStep),
        );
      },
    ),
  );
  expect(trackPhase(0, g.phaseStep)).toBe(0);
  expect(trackPhase(1.5 * g.phaseStep, g.phaseStep)).toBe(1);
  expect(trackPhase(-0.5 * g.phaseStep, g.phaseStep)).toBe(2);
});
it("turns the wheels by travel over the radius", () => {
  expect(trackSpin(2 * Math.PI * g.radius, g.radius)).toBe(0);
  expect(trackSpin((Math.PI * g.radius) / 2, g.radius)).toBe(90);
  fc.assert(
    fc.property(n, (t) => {
      const s = trackSpin(t, g.radius);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(360);
    }),
  );
});
