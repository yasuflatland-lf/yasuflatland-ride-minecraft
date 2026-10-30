import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEADLINE_FACTOR,
  deadlineMsOf,
  observe,
  SETUP_MARGIN_MS,
  STALL_MS,
  TPS,
  watchStart,
  watchVerdict,
} from "../../src/test-pack/deadline";

describe("run watch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const ticks = fc.nat({ max: 1_000_000 });

  it("allows at least 75 ms per declared tick and grows monotonically", () => {
    expect(TPS).toBe(20);
    expect(DEADLINE_FACTOR).toBe(1.5);
    fc.assert(
      fc.property(ticks, ticks, (a, b) => {
        expect(deadlineMsOf(a)).toBeGreaterThanOrEqual(
          a * 75 + SETUP_MARGIN_MS,
        );
        expect(deadlineMsOf(Math.max(a, b))).toBeGreaterThanOrEqual(
          deadlineMsOf(Math.min(a, b)),
        );
        expect(deadlineMsOf(a) - (a * 75 + SETUP_MARGIN_MS)).toBeLessThan(
          1.000001,
        );
      }),
    );
  });

  it("keeps running with progress at intervals up to 60 seconds, without a plan", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: STALL_MS }), {
          minLength: 1,
          maxLength: 50,
        }),
        (intervals) => {
          vi.setSystemTime(0);
          let w = watchStart(Date.now());
          for (const [i, elapsed] of intervals.entries()) {
            vi.advanceTimersByTime(elapsed);
            expect(watchVerdict(w, Date.now())).toBe("running");
            w = observe(w, Date.now(), i + 1);
            expect(w.lastProgressAt).toBe(Date.now());
            expect(w.deadlineAt).toBeUndefined();
          }
        },
      ),
    );
  });

  it("stalls strictly after 60 seconds without new lines, including failed polls", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (extra) => {
        vi.setSystemTime(0);
        const w = watchStart(Date.now());
        vi.advanceTimersByTime(STALL_MS);
        expect(watchVerdict(observe(w, Date.now(), 0), Date.now())).toBe(
          "running",
        );
        vi.advanceTimersByTime(extra);
        expect(watchVerdict(observe(w, Date.now(), 0), Date.now())).toBe(
          "stalled",
        );
      }),
    );
  });

  it("sets the deadline on the first plan and never extends it with later plans or progress", () => {
    fc.assert(
      fc.property(ticks, ticks, (first, later) => {
        vi.setSystemTime(1000);
        const start = watchStart(Date.now());
        vi.advanceTimersByTime(3000);
        const planned = observe(start, Date.now(), 1, { ticks: first });
        const deadline = Date.now() + deadlineMsOf(first);
        expect(planned.deadlineAt).toBe(deadline);
        vi.setSystemTime(deadline);
        const updated = observe(planned, Date.now(), 2, { ticks: later });
        expect(updated.deadlineAt).toBe(deadline);
        expect(watchVerdict(updated, Date.now())).toBe("running");
        vi.advanceTimersByTime(1);
        expect(watchVerdict(updated, Date.now())).toBe("overdue");
        vi.advanceTimersByTime(STALL_MS);
        expect(watchVerdict(updated, Date.now())).toBe("stalled");
      }),
    );
  });
});
