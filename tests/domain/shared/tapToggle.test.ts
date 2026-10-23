import fc from "fast-check";
import { expect, it } from "vitest";
import { TapToggle } from "../../../src/domain/shared/tapToggle";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";

const windows = fc.oneof(
  fc.constant(CAMPER_SPEC.doorSwingTicks),
  fc.integer({ min: 1, max: 40 }),
);

/** A window and a gap of up to `maxWindows` windows after a tap. */
function windowAndGap(
  maxWindows: number,
): fc.Arbitrary<readonly [number, number]> {
  return windows.chain((w) =>
    fc.tuple(fc.constant(w), fc.integer({ min: 0, max: maxWindows * w })),
  );
}

it("toggles two taps within a window once and taps a window or more apart each time (ADR 0105)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      windowAndGap(3),
      (first, [w, gap]) => {
        const toggle = new TapToggle(w);
        expect(toggle.tryToggle(first)).toBe(true);
        expect(toggle.tryToggle(first + gap)).toBe(gap >= w);
      },
    ),
  );
});

it("measures the window from the last toggle, so ignored taps do not delay the next one (ADR 0105)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      windows.chain((w) =>
        fc.tuple(
          fc.constant(w),
          fc.array(fc.integer({ min: 0, max: 2 * w }), { maxLength: 30 }),
        ),
      ),
      (start, [w, gaps]) => {
        const toggle = new TapToggle(w);
        let tick = start;
        let lastToggle = Number.NEGATIVE_INFINITY;
        for (const gap of [0, ...gaps]) {
          tick += gap;
          const toggles = tick - lastToggle >= w;
          if (toggles) lastToggle = tick;
          expect(toggle.tryToggle(tick)).toBe(toggles);
        }
      },
    ),
  );
});

it("is within the window exactly when a tap would be ignored, and checking does not toggle (ADR 0105, 0118)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      windowAndGap(3),
      (first, [w, gap]) => {
        const toggle = new TapToggle(w);
        expect(toggle.withinWindow(first)).toBe(false);
        toggle.tryToggle(first);
        const within = toggle.withinWindow(first + gap);
        expect(within).toBe(gap < w);
        expect(toggle.withinWindow(first + gap)).toBe(within);
        expect(toggle.tryToggle(first + gap)).toBe(!within);
      },
    ),
  );
});

it("two toggles with different windows keep their own window", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc
        .tuple(windows, windows)
        .filter(([a, b]) => a !== b)
        .chain(([a, b]) =>
          fc.tuple(
            fc.constant(a),
            fc.constant(b),
            fc.array(fc.integer({ min: 0, max: 2 * Math.max(a, b) }), {
              maxLength: 30,
            }),
          ),
        ),
      (start, [a, b, gaps]) => {
        const first = new TapToggle(a);
        const second = new TapToggle(b);
        let tick = start;
        let lastFirst = Number.NEGATIVE_INFINITY;
        let lastSecond = Number.NEGATIVE_INFINITY;
        for (const gap of [0, Math.min(a, b), ...gaps]) {
          tick += gap;
          const togglesFirst = tick - lastFirst >= a;
          const togglesSecond = tick - lastSecond >= b;
          expect(first.tryToggle(tick)).toBe(togglesFirst);
          expect(second.tryToggle(tick)).toBe(togglesSecond);
          if (togglesFirst) lastFirst = tick;
          if (togglesSecond) lastSecond = tick;
        }
      },
    ),
  );
});
