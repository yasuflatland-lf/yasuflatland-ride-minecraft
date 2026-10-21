import fc from "fast-check";
import { expect, it } from "vitest";
import { DoorToggle } from "../../../../../src/domain/vehicle/kinds/camper/doorToggle";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";

const SWING = CAMPER_SPEC.doorSwingTicks;

it("toggles two taps within a swing once and taps a swing or more apart each time (ADR 0105)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.integer({ min: 0, max: 3 * SWING }),
      (first, gap) => {
        const door = new DoorToggle();
        expect(door.tryToggle(first)).toBe(true);
        expect(door.tryToggle(first + gap)).toBe(gap >= SWING);
      },
    ),
  );
});

it("measures the swing from the last toggle, so ignored taps do not delay the next one (ADR 0105)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.array(fc.integer({ min: 0, max: 2 * SWING }), { maxLength: 30 }),
      (start, gaps) => {
        const door = new DoorToggle();
        let tick = start;
        let lastToggle = Number.NEGATIVE_INFINITY;
        for (const gap of [0, ...gaps]) {
          tick += gap;
          const toggles = tick - lastToggle >= SWING;
          if (toggles) lastToggle = tick;
          expect(door.tryToggle(tick)).toBe(toggles);
        }
      },
    ),
  );
});
