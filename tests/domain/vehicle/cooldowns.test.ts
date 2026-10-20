import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward } from "../../../src/domain/shared/vec";
import {
  RamCooldowns,
  SwitchCooldown,
} from "../../../src/domain/vehicle/cooldowns";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { type RamTarget, selectHits } from "../../../src/domain/vehicle/ram";
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

describe("RamCooldowns (ADR 0006)", () => {
  it("forgets a target exactly when its cooldown has run out", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 3 * SPEC.ramCooldown }),
        (hitTick, later) => {
          const c = new RamCooldowns();
          c.record([{ id: "t" }], hitTick);
          c.prune(hitTick + later);
          expect(c.recent.has("t")).toBe(later < SPEC.ramCooldown);
        },
      ),
    );
  });

  it("records the last tick of every hit", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string(), { maxLength: 5 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (ids, tick, later) => {
          const c = new RamCooldowns();
          c.record(
            ids.map((id) => ({ id })),
            tick,
          );
          for (const id of ids) expect(c.recent.get(id)).toBe(tick);
          for (const id of ids) {
            c.record([{ id }], tick + later);
            expect(c.recent.get(id)).toBe(tick + later);
          }
        },
      ),
    );
  });

  it("with selectHits, hits one target again exactly once its cooldown has run out", () => {
    const target: RamTarget = {
      id: "t",
      offset: { x: 0, y: 0, z: 1 },
      protectedOccupant: false,
    };
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 2 * SPEC.ramCooldown }), {
          minLength: 1,
          maxLength: 40,
        }),
        (gaps) => {
          const c = new RamCooldowns();
          let lastHitTick: number | undefined;
          for (const t of ticksFrom(gaps)) {
            c.prune(t);
            const hits = selectHits(
              forward(0),
              1,
              [target],
              c.recent,
              t,
              SUV_PROFILE.ram,
            );
            c.record(hits, t);
            const expected =
              lastHitTick === undefined || t - lastHitTick >= SPEC.ramCooldown;
            expect(hits.length).toBe(expected ? 1 : 0);
            if (expected) lastHitTick = t;
          }
        },
      ),
    );
  });
});
