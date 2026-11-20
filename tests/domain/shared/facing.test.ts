import fc from "fast-check";
import { expect, it } from "vitest";
import {
  type Facing4,
  facePlayer,
  quarterOf,
  snapYaw,
  snapYaw4,
} from "../../../src/domain/shared/facing";

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

const step = fc.constantFrom(30, 45, 90, 180);
const yaw = fc.double({ min: -1e6, max: 1e6, noNaN: true });

it("snaps to the nearest step in (-180, 180] and preserves snapped rotations", () => {
  fc.assert(
    fc.property(yaw, step, (angle, step) => {
      const snapped = snapYaw(angle, step);
      expect(snapped).toBeGreaterThan(-180);
      expect(snapped).toBeLessThanOrEqual(180);
      expect(Math.abs(snapped % step)).toBe(0);
      expect(Object.is(snapped, -0)).toBe(false);
      const delta = ((((angle - snapped) % 360) + 540) % 360) - 180;
      expect(Math.abs(delta)).toBeLessThanOrEqual(step / 2);
      expect(snapYaw(snapped, step)).toBe(snapped);
      expect(facePlayer(angle, step)).toBe(snapYaw(angle + 180, step));
      expect(quarterOf(angle) * 90).toBe(snapYaw4(angle));
      expect(quarterOf(angle)).toBe((snapYaw(angle) / 90 + 4) % 4);
    }),
  );
});

it("preserves snapped rotations across whole turns, including half-step ties", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -720, max: 720 }),
      fc.integer(),
      step,
      (halfDegrees, turns, step) => {
        const angle = halfDegrees / 2;
        expect(snapYaw(angle + turns * 360, step)).toBe(snapYaw(angle, step));
      },
    ),
  );
});

it.each([0, -90, 7, 1.5])("rejects invalid step %s", (step) => {
  expect(() => snapYaw(0, step)).toThrow(RangeError);
});
