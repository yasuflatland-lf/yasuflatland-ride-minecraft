import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_COUNTER,
  type HitCounter,
  type HitRule,
  registerHit,
} from "../../../src/domain/shared/hitCounter";
import { SPEC } from "../../../src/domain/vehicle/spec";

const VEHICLE_RULE: HitRule = {
  hits: SPEC.hitsToBreak,
  resetTicks: SPEC.hitResetTicks,
};

const rules = fc.record({
  hits: fc.integer({ min: 1, max: 6 }),
  resetTicks: fc.integer({ min: 1, max: 200 }),
});

const hitsFor = (rule: HitRule) =>
  fc.array(
    fc.record({
      gap: fc.integer({ min: 0, max: rule.resetTicks * 2 }),
      occupied: fc.boolean(),
    }),
    { maxLength: 60 },
  );

describe("registerHit (ADR 0008, 0121)", () => {
  it("breaks after 3 hits in quick succession with the vehicle rule", () => {
    let c = EMPTY_COUNTER;
    const results = [0, 10, 20].map((t) => {
      const r = registerHit(c, t, false, VEHICLE_RULE);
      c = r.counter;
      return r.broken;
    });
    expect(results).toEqual([false, false, true]);
  });

  it("ignores occupied hits and breaks exactly on the n-th free hit within the reset window", () => {
    fc.assert(
      fc.property(
        rules.chain((rule) => fc.tuple(fc.constant(rule), hitsFor(rule))),
        ([rule, events]) => {
          let c: HitCounter = EMPTY_COUNTER;
          let tick = 0;
          let streak = 0;
          let lastFree = Number.NEGATIVE_INFINITY;
          for (const { gap, occupied } of events) {
            tick += gap;
            const r = registerHit(c, tick, occupied, rule);
            if (occupied) {
              expect(r.broken).toBe(false);
              expect(r.counter).toEqual(c);
            } else {
              streak = tick - lastFree <= rule.resetTicks ? streak + 1 : 1;
              lastFree = tick;
              const shouldBreak = streak >= rule.hits;
              expect(r.broken).toBe(shouldBreak);
              if (shouldBreak) {
                streak = 0;
                lastFree = Number.NEGATIVE_INFINITY;
              } else {
                expect(r.counter.count).toBe(streak);
              }
            }
            c = r.counter;
          }
        },
      ),
    );
  });

  it("never breaks when every hit comes after more than the reset window", () => {
    fc.assert(
      fc.property(
        rules.filter((rule) => rule.hits > 1),
        fc.integer({ min: 1, max: 20 }),
        (rule, n) => {
          let c: HitCounter = EMPTY_COUNTER;
          for (let i = 0; i < n; i++) {
            const r = registerHit(c, i * (rule.resetTicks + 1), false, rule);
            expect(r.broken).toBe(false);
            expect(r.counter.count).toBe(1);
            c = r.counter;
          }
        },
      ),
    );
  });

  it("keeps the count when the gap is exactly the reset window", () => {
    let c = registerHit(EMPTY_COUNTER, 0, false, VEHICLE_RULE).counter;
    c = registerHit(c, 10, false, VEHICLE_RULE).counter;
    const r = registerHit(c, 10 + SPEC.hitResetTicks, false, VEHICLE_RULE);
    expect(r.broken).toBe(true);
  });

  it("resets the count to 0 when not hit for more than the reset window", () => {
    let c = registerHit(EMPTY_COUNTER, 0, false, VEHICLE_RULE).counter;
    c = registerHit(c, 10, false, VEHICLE_RULE).counter;
    const r = registerHit(c, 10 + SPEC.hitResetTicks + 1, false, VEHICLE_RULE);
    expect(r.broken).toBe(false);
    expect(r.counter.count).toBe(1);
  });
});
