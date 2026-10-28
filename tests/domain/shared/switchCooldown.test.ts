import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LIGHT_SWITCH_COOLDOWN_TICKS,
  SwitchCooldown,
  SwitchCooldowns,
} from "../../../src/domain/shared/switchCooldown";
import { SPEC } from "../../../src/domain/vehicle/spec";

/** Ticks from gaps: the first tick is `gaps[0]`, each next one adds its gap. */
function ticksFrom(gaps: readonly number[]): number[] {
  let t = 0;
  return gaps.map((gap) => {
    t += gap;
    return t;
  });
}

describe("SwitchCooldown (ADR 0024)", () => {
  it("counts a use only after the switch was idle for the cooldown", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.array(fc.integer({ min: 0, max: 10 }), {
          minLength: 1,
          maxLength: 30,
        }),
        (cooldown, gaps) => {
          const c = new SwitchCooldown();
          let previous = Number.NEGATIVE_INFINITY;
          for (const t of ticksFrom(gaps)) {
            expect(c.tryUse(t, cooldown)).toBe(t - previous >= cooldown);
            previous = t;
          }
        },
      ),
    );
  });

  it("restarts the idle time on a use that does not count", () => {
    const c = new SwitchCooldown();
    expect(c.tryUse(100, 10)).toBe(true);
    expect(c.tryUse(105, 10)).toBe(false);
    expect(c.tryUse(114, 10)).toBe(false);
    expect(c.tryUse(124, 10)).toBe(true);
  });
});

it("keeps the shared light switch cooldown at ten ticks", () => {
  expect(LIGHT_SWITCH_COOLDOWN_TICKS).toBe(10);
  expect(SPEC.headlightSwitchCooldown).toBe(LIGHT_SWITCH_COOLDOWN_TICKS);
});

type Step =
  | { kind: "use"; key: number; gap: number }
  | { kind: "forget"; gap: number };

const stepsArb = fc.array(
  fc.oneof(
    fc.record({
      kind: fc.constant("use" as const),
      key: fc.integer({ min: 0, max: 3 }),
      gap: fc.integer({ min: 0, max: 15 }),
    }),
    fc.record({
      kind: fc.constant("forget" as const),
      gap: fc.integer({ min: 0, max: 15 }),
    }),
  ),
  { maxLength: 60 },
);

/** Results of every use, in order, optionally skipping the forgetIdle steps. */
function run(
  steps: readonly Step[],
  cooldown: number,
  withForget: boolean,
): boolean[] {
  const cooldowns = new SwitchCooldowns<number>(cooldown);
  const results: boolean[] = [];
  let tick = 0;
  for (const step of steps) {
    tick += step.gap;
    if (step.kind === "forget") {
      if (withForget) cooldowns.forgetIdle(tick);
    } else results.push(cooldowns.tryUse(step.key, tick));
  }
  return results;
}

describe("SwitchCooldowns", () => {
  it("answers like one SwitchCooldown per key", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        stepsArb,
        (cooldown, steps) => {
          const model = new Map<number, SwitchCooldown>();
          const expected: boolean[] = [];
          let tick = 0;
          for (const step of steps) {
            tick += step.gap;
            if (step.kind === "forget") continue;
            let c = model.get(step.key);
            if (c === undefined) {
              c = new SwitchCooldown();
              model.set(step.key, c);
            }
            expected.push(c.tryUse(tick, cooldown));
          }
          expect(run(steps, cooldown, true)).toEqual(expected);
        },
      ),
    );
  });

  it("never changes a result by forgetting idle keys", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        stepsArb,
        (cooldown, steps) => {
          expect(run(steps, cooldown, true)).toEqual(
            run(steps, cooldown, false),
          );
        },
      ),
    );
  });

  it("keeps the keys independent of each other", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        stepsArb,
        (cooldown, steps) => {
          const all = new SwitchCooldowns<number>(cooldown);
          const alone = new SwitchCooldowns<number>(cooldown);
          let tick = 0;
          for (const step of steps) {
            tick += step.gap;
            if (step.kind !== "use") continue;
            const result = all.tryUse(step.key, tick);
            if (step.key === 0) expect(alone.tryUse(0, tick)).toBe(result);
          }
        },
      ),
    );
  });

  it("defaults to the light switch cooldown", () => {
    const c = new SwitchCooldowns<string>();
    expect(c.tryUse("a", 100)).toBe(true);
    expect(c.tryUse("a", 109)).toBe(false);
    expect(c.tryUse("a", 119)).toBe(true);
  });
});
