import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LIGHT_SWITCH_COOLDOWN_TICKS,
  SwitchCooldown,
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
