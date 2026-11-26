import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { NavGuideThrottle } from "../../../../src/domain/vehicle/navigation/navGuide";
import { SPEC } from "../../../../src/domain/vehicle/spec";

const tick = fc.nat();
const offset = fc.integer({ min: 0, max: SPEC.navGuideInterval - 1 });
const player = asPlayerId("rider");

it("suppresses taps within the interval after either guide and allows a tap at expiry", () => {
  fc.assert(
    fc.property(
      tick,
      fc.constantFrom("select", "tap"),
      fc.array(offset, { minLength: 1 }),
      (start, trigger, offsets) => {
        const throttle = new NavGuideThrottle();
        expect(throttle.allow(player, start, trigger)).toBe(true);
        for (const elapsed of offsets.sort((a, b) => a - b)) {
          expect(throttle.allow(player, start + elapsed, "tap")).toBe(false);
        }
        expect(
          throttle.allow(player, start + SPEC.navGuideInterval, "tap"),
        ).toBe(true);
      },
    ),
  );
});

it("always allows selection and refreshes the tap interval", () => {
  fc.assert(
    fc.property(tick, offset, (start, elapsed) => {
      const throttle = new NavGuideThrottle();
      expect(throttle.allow(player, start, "tap")).toBe(true);
      const selectedAt = start + elapsed;
      expect(throttle.allow(player, selectedAt, "select")).toBe(true);
      expect(
        throttle.allow(player, selectedAt + SPEC.navGuideInterval - 1, "tap"),
      ).toBe(false);
    }),
  );
});

it("keeps tap intervals independent for each player", () => {
  fc.assert(
    fc.property(tick, offset, fc.string(), (start, elapsed, id) => {
      const throttle = new NavGuideThrottle();
      const other = asPlayerId(`other:${id}`);
      expect(throttle.allow(player, start, "select")).toBe(true);
      expect(throttle.allow(other, start + elapsed, "tap")).toBe(true);
      expect(throttle.allow(player, start + elapsed, "tap")).toBe(false);
      expect(throttle.allow(other, start + elapsed, "tap")).toBe(false);
    }),
  );
});
