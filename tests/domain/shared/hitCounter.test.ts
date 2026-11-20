import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_COUNTER,
  type HitCounter,
  HitCounters,
  type HitRule,
  hitRule,
  registerHit,
} from "../../../src/domain/shared/hitCounter";
import { ticks } from "../../../src/domain/shared/ticks";
import { SPEC } from "../../../src/domain/vehicle/spec";

const VEHICLE_RULE: HitRule = {
  hits: SPEC.hitsToBreak,
  resetTicks: SPEC.hitResetTicks,
};

describe("hitRule", () => {
  it("preserves valid inputs in a frozen rule", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }).map(ticks),
        (hits, resetTicks) => {
          const rule = hitRule(hits, resetTicks);
          expect(rule).toEqual({ hits, resetTicks });
          expect(Object.isFrozen(rule)).toBe(true);
        },
      ),
    );
  });

  it("rejects hit counts below one or that are not integers", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.double().filter((hits) => !Number.isInteger(hits)),
          fc.constantFrom(
            Number.NaN,
            Number.NEGATIVE_INFINITY,
            Number.POSITIVE_INFINITY,
          ),
        ),
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }).map(ticks),
        (hits, resetTicks) => {
          expect(() => hitRule(hits, resetTicks)).toThrow(RangeError);
        },
      ),
    );
  });
});

const rules = fc.record({
  hits: fc.integer({ min: 1, max: 6 }),
  resetTicks: fc.integer({ min: 1, max: 200 }).map(ticks),
});

const gapFor = (rule: HitRule) =>
  fc.oneof(
    fc.constantFrom(0, rule.resetTicks, rule.resetTicks + 1),
    fc.integer({ min: 0, max: rule.resetTicks * 2 }),
  );

const hitsFor = (rule: HitRule) =>
  fc.array(fc.record({ gap: gapFor(rule), occupied: fc.boolean() }), {
    maxLength: 60,
  });

describe("registerHit (ADR 0008, 0122)", () => {
  it("ignores occupied hits and breaks exactly on the n-th free hit within the reset window", () => {
    fc.assert(
      fc.property(
        fc
          .oneof(fc.constant(VEHICLE_RULE), rules)
          .chain((rule) => fc.tuple(fc.constant(rule), hitsFor(rule))),
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
});

const stepsFor = (rule: HitRule) => {
  const gap = gapFor(rule);
  return fc.array(
    fc.oneof(
      fc.record({
        kind: fc.constant("hit" as const),
        key: fc.integer({ min: 0, max: 3 }),
        gap,
      }),
      fc.record({ kind: fc.constant("forget" as const), gap }),
    ),
    { minLength: 1, maxLength: 100 },
  );
};

describe("HitCounters", () => {
  it("matches independent hit chains with or without stale cleanup", () => {
    fc.assert(
      fc.property(
        rules.chain((rule) => fc.tuple(fc.constant(rule), stepsFor(rule))),
        ([rule, steps]) => {
          const model = new Map<number, HitCounter>();
          const hits = new HitCounters<number>(rule);
          const unpruned = new HitCounters<number>(rule);
          const isolated = Array.from(
            { length: 4 },
            () => new HitCounters<number>(rule),
          );
          let tick = 0;
          for (const step of steps) {
            tick += step.gap;
            if (step.kind === "forget") {
              hits.forgetStale(tick);
              continue;
            }
            const { key } = step;
            const expected = registerHit(
              model.get(key) ?? EMPTY_COUNTER,
              tick,
              false,
              rule,
            );
            model.set(key, expected.counter);
            const alone = isolated[key];
            if (!alone) throw new Error("Missing isolated counter");
            const results = [
              hits.hit(key, tick),
              unpruned.hit(key, tick),
              alone.hit(key, tick),
            ];
            for (const result of results) {
              expect(result).toEqual({
                broken: expected.broken,
                hitsLeft: rule.hits - expected.counter.count,
              });
            }
          }
        },
      ),
    );
  });
});
