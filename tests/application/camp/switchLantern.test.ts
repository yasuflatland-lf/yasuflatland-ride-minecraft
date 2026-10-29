import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SwitchLantern } from "../../../src/application/camp/switchLantern";
import { asTentId } from "../../../src/domain/camp/tent";
import { LIGHT_SWITCH_COOLDOWN_TICKS } from "../../../src/domain/shared/switchCooldown";
import { FakeLanternWorld } from "./fakeLanternWorld";

const A = asTentId("-1");
const B = asTentId("-2");

const arbGaps = fc.array(
  fc.integer({ min: 0, max: 3 * LIGHT_SWITCH_COOLDOWN_TICKS }),
  {
    minLength: 1,
    maxLength: 30,
  },
);

/** Presses that count: the first, and every one at least the cooldown after the press before it. */
function counted(ticks: readonly number[]): number {
  return ticks.filter(
    (t, i) => i === 0 || t - (ticks[i - 1] ?? t) >= LIGHT_SWITCH_COOLDOWN_TICKS,
  ).length;
}

const ticksOf = (start: number, gaps: readonly number[]): number[] => {
  let t = start;
  return gaps.map((g) => {
    t += g;
    return t;
  });
};

describe("SwitchLantern (ADR 0024)", () => {
  it("flips once per press that follows an idle cooldown, each time to the opposite state", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 100000 }),
        arbGaps,
        (start, first, gaps) => {
          const world = new FakeLanternWorld();
          world.lanterns.set(A, start);
          const lantern = new SwitchLantern(world);
          const ticks = ticksOf(first, gaps);
          let before = start;
          for (const tick of ticks) {
            const flipped = lantern.execute({ tentId: A, tick });
            if (flipped) {
              expect(world.set.at(-1)).toEqual({ tentId: A, on: !before });
              before = !before;
            }
          }
          const flips = counted(ticks);
          expect(world.set).toHaveLength(flips);
          expect(world.lanterns.get(A)).toBe(start !== (flips % 2 === 1));
        },
      ),
    );
  });

  it("keeps each tent's cooldown to its own presses", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            tent: fc.constantFrom(A, B),
            gap: fc.integer({ min: 0, max: 3 * LIGHT_SWITCH_COOLDOWN_TICKS }),
          }),
          { minLength: 1, maxLength: 40 },
        ),
        (presses) => {
          const world = new FakeLanternWorld();
          world.lanterns.set(A, false);
          world.lanterns.set(B, false);
          const lantern = new SwitchLantern(world);
          const ticks = ticksOf(
            0,
            presses.map((p) => p.gap),
          );
          presses.forEach((p, i) => {
            lantern.execute({ tentId: p.tent, tick: ticks[i] ?? 0 });
          });
          for (const tent of [A, B]) {
            const own = ticks.filter((_, i) => presses[i]?.tent === tent);
            expect(world.set.filter((s) => s.tentId === tent)).toHaveLength(
              counted(own),
            );
          }
        },
      ),
    );
  });

  it("does nothing and records no use for a tent that is gone", () => {
    const world = new FakeLanternWorld();
    const lantern = new SwitchLantern(world);
    expect(lantern.execute({ tentId: A, tick: 100 })).toBe(false);
    expect(world.set).toEqual([]);
    world.lanterns.set(A, false);
    expect(lantern.execute({ tentId: A, tick: 101 })).toBe(true);
    expect(world.set).toEqual([{ tentId: A, on: true }]);
  });

  it("treats a tent idle for the cooldown like a fresh one", () => {
    const world = new FakeLanternWorld();
    world.lanterns.set(A, false);
    world.lanterns.set(B, false);
    const lantern = new SwitchLantern(world);
    expect(lantern.execute({ tentId: A, tick: 0 })).toBe(true);
    expect(
      lantern.execute({ tentId: B, tick: LIGHT_SWITCH_COOLDOWN_TICKS }),
    ).toBe(true);
    expect(
      lantern.execute({ tentId: A, tick: LIGHT_SWITCH_COOLDOWN_TICKS }),
    ).toBe(true);
    expect(
      lantern.execute({ tentId: A, tick: LIGHT_SWITCH_COOLDOWN_TICKS + 1 }),
    ).toBe(false);
    expect(world.set).toHaveLength(3);
  });
});
