import fc from "fast-check";
import { expect, it } from "vitest";
import { type Facing4, snapYaw4 } from "../../../src/domain/shared/facing";

const facings: readonly Facing4[] = [0, 90, 180, 270];

it("snaps finite yaw to an idempotent cardinal heading within half a turn step", () => {
  fc.assert(
    fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (yaw) => {
      const snapped = snapYaw4(yaw);
      expect(facings).toContain(snapped);
      expect(snapYaw4(snapped)).toBe(snapped);
      const delta = ((((yaw - snapped) % 360) + 540) % 360) - 180;
      expect(Math.abs(delta)).toBeLessThanOrEqual(45 + 1e-9);
      expect(Object.is(snapped, -0)).toBe(false);
    }),
  );
});

it("preserves cardinal headings under arbitrary full turns", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...facings),
      fc.integer({ min: -10000, max: 10000 }),
      (yaw, turns) => {
        expect(snapYaw4(yaw + turns * 360)).toBe(yaw);
      },
    ),
  );
});

it("rounds half-step ties toward positive yaw and normalizes negative turns", () => {
  expect([45, -45, 135, -135, -270, 360].map(snapYaw4)).toEqual([
    90, 0, 180, 270, 90, 0,
  ]);
});
