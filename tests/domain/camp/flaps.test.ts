import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FLAP_IDS, TentFlaps } from "../../../src/domain/camp/flaps";
import { TENT_SPEC } from "../../../src/domain/camp/spec";
import type { FlapId } from "../../../src/domain/camp/tent";
import { clamp } from "../../../src/domain/shared/vec";

const STEPS = TENT_SPEC.flapSwingTicks;
const arbFlap = fc.constantFrom(...FLAP_IDS);
const closed = () => new TentFlaps(() => 0);
const openSet = (flaps: TentFlaps) =>
  new Set(FLAP_IDS.filter((id) => flaps.isOpen(id)));

/** Each flap's last sent value, after `swing()` calls. */
function sentValues(flaps: TentFlaps, swings: number): Map<FlapId, number> {
  const sent = new Map<FlapId, number>();
  for (let i = 0; i < swings; i++)
    for (const s of flaps.swing()) sent.set(s.flap, s.open);
  return sent;
}

describe("TentFlaps (ADR 0132)", () => {
  it("toggles only the tapped flap, and open() is the set of open targets", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbFlap, fc.nat({ max: 30 })), { maxLength: 40 }),
        (taps) => {
          const flaps = closed();
          let tick = 0;
          for (const [flap, gap] of taps) {
            tick += gap;
            const before = openSet(flaps);
            const flipped = flaps.toggle(flap, tick);
            const after = openSet(flaps);
            for (const id of FLAP_IDS)
              expect(after.has(id)).toBe(
                id === flap && flipped ? !before.has(id) : before.has(id),
              );
            expect(flaps.open()).toEqual(after);
          }
        },
      ),
    );
  });

  it("toggles twice for taps `gap` ticks apart exactly when the gap is a full window, each flap on its own window", () => {
    fc.assert(
      fc.property(
        arbFlap,
        arbFlap,
        fc.nat({ max: 3 * STEPS }),
        fc.integer({ min: 0, max: 1000 }),
        (flap, other, gap, start) => {
          const flaps = closed();
          expect(flaps.toggle(flap, start)).toBe(true);
          expect(flaps.withinWindow(flap, start + gap)).toBe(gap < STEPS);
          if (other !== flap) expect(flaps.toggle(other, start + 1)).toBe(true);
          expect(flaps.toggle(flap, start + gap)).toBe(gap >= STEPS);
        },
      ),
    );
  });

  it("swings each flap at most one step per call, within 0..1, to its target within flapSwingTicks calls", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbFlap, fc.nat({ max: 2 * STEPS })), {
          maxLength: 10,
        }),
        (taps) => {
          const flaps = closed();
          const value = new Map<FlapId, number>(FLAP_IDS.map((id) => [id, 0]));
          const swingOnce = () => {
            for (const s of flaps.swing()) {
              const prev = value.get(s.flap) ?? 0;
              expect(Math.abs(s.open - prev)).toBeLessThanOrEqual(
                1 / STEPS + 1e-12,
              );
              expect(s.open).toBeGreaterThanOrEqual(0);
              expect(s.open).toBeLessThanOrEqual(1);
              value.set(s.flap, s.open);
            }
          };
          swingOnce();
          let tick = 0;
          for (const [flap, gap] of taps) {
            tick += gap;
            const wasOpen = flaps.isOpen(flap);
            if (flaps.toggle(flap, tick))
              // The target, and so the laid block, flips at the tap.
              expect(flaps.open().has(flap)).toBe(!wasOpen);
            for (let i = 0; i < gap % 3; i++) swingOnce();
          }
          for (let i = 0; i < STEPS; i++) swingOnce();
          for (const id of FLAP_IDS)
            expect(value.get(id)).toBe(flaps.isOpen(id) ? 1 : 0);
        },
      ),
    );
  });

  it("sends a flap only when its value changed, every flap first and after resync", () => {
    const flaps = closed();
    expect(flaps.swing()).toEqual(FLAP_IDS.map((flap) => ({ flap, open: 0 })));
    expect(flaps.swing()).toEqual([]);
    flaps.toggle("left", 0);
    expect(flaps.swing()).toEqual([{ flap: "left", open: 1 / STEPS }]);
    flaps.resync();
    expect(flaps.swing().map((s) => s.flap)).toEqual(FLAP_IDS);
    expect(sentValues(flaps, 3 * STEPS)).toEqual(new Map([["left", 1]]));
  });

  it("restores each flap from its saved value with the storage doors' rounding (ADR 0121)", () => {
    fc.assert(
      fc.property(
        fc.record({
          front: fc.double({ min: 0, max: 1, noNaN: true }),
          left: fc.double({ min: 0, max: 1, noNaN: true }),
          right: fc.oneof(fc.constant(undefined), fc.string(), fc.boolean()),
          bedroom: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        (saved) => {
          const flaps = new TentFlaps((id) => saved[id]);
          const first = new Map(flaps.swing().map((s) => [s.flap, s.open]));
          for (const id of FLAP_IDS) {
            const v = saved[id];
            const step =
              typeof v === "number"
                ? clamp(Math.round(v * STEPS), 0, STEPS)
                : 0;
            const open = step * 2 >= STEPS;
            expect(flaps.isOpen(id)).toBe(open);
            // The first swing moves one step on from the restored step.
            const target = open ? STEPS : 0;
            expect(first.get(id)).toBe(
              (step + Math.sign(target - step)) / STEPS,
            );
          }
        },
      ),
    );
    expect(closed().open()).toEqual(new Set());
  });
});
