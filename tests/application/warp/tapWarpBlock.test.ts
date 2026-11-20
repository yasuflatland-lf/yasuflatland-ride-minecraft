import fc from "fast-check";
import { expect, it } from "vitest";
import type { WarpBlockTaps } from "../../../src/application/warp/ports/blockTaps";
import { RemoveWarpPoint } from "../../../src/application/warp/removeWarpPoint";
import { TapWarpBlock } from "../../../src/application/warp/tapWarpBlock";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { player, point, setup } from "./fakes";

// Waits resolve only when the test advances the clock past their deadline, so
// taps landing inside the window are seen before an earlier tap settles.
class Clock {
  now = 0;
  private waits: { at: number; resolve: () => void }[] = [];
  wait(ticks: number): Promise<void> {
    return new Promise((resolve) =>
      this.waits.push({ at: this.now + ticks, resolve }),
    );
  }
  async advanceTo(tick: number): Promise<void> {
    this.now = tick;
    const due = this.waits.filter((w) => w.at <= tick);
    this.waits = this.waits.filter((w) => w.at > tick);
    for (const w of due) w.resolve();
    for (let n = 0; n < 5; n++) await Promise.resolve();
  }
}

function fixture(blocks?: WarpBlockTaps) {
  const p = point();
  const f = setup({ points: [p] });
  const clock = new Clock();
  let present = true;
  let drops = 0;
  let removals = 0;
  const messages: (number | string)[] = [];
  const tap = new TapWarpBlock(
    blocks ?? {
      at: () =>
        present
          ? {
              drop: () => {
                drops++;
              },
              remove: () => {
                present = false;
                removals++;
                messages.push("broken");
              },
              showRemaining: (left) => {
                messages.push(left);
              },
            }
          : undefined,
    },
    new RemoveWarpPoint(f.store),
    clock,
  );
  const settled: boolean[] = [];
  const run = async (
    now: number,
    target: Partial<Parameters<TapWarpBlock["run"]>[0]> = {},
  ) => {
    await clock.advanceTo(now);
    void tap
      .run({
        playerId: player,
        dimension: p.dimension,
        cell: p.cell,
        now,
        ...target,
      })
      .then((open) => settled.push(open));
  };
  return {
    ...f,
    p,
    clock,
    run,
    settled,
    messages,
    counts: () => ({ drops, removals }),
  };
}

const gap = fc.integer({ min: 1, max: WARP_SPEC.tapWindowTicks });

it.each([
  ["alice", "bob"],
  ["bob", "alice"],
])(
  "opens the list for %s and %s tapping in the same tick",
  async (first, second) => {
    const f = fixture();
    await f.run(0, { playerId: asPlayerId(first) });
    await f.run(0, { playerId: asPlayerId(second) });
    await f.clock.advanceTo(WARP_SPEC.tapWindowTicks + 1);
    expect(f.settled).toEqual([true, true]);
  },
);

it("settles each player's taps independently while the block remains intact", async () => {
  const events = fc
    .array(
      fc.record({
        player: fc.integer({ min: 0, max: 2 }),
        gap: fc.integer({ min: 0, max: 25 }),
      }),
      { minLength: 1, maxLength: 30 },
    )
    .map((steps) => {
      let tick = 0;
      return steps.map((step) => {
        tick += step.gap;
        return { player: step.player, tick };
      });
    })
    .filter((taps) =>
      taps.every(
        (tap, i) =>
          taps
            .slice(0, i)
            .every(
              (prior) =>
                prior.player !== tap.player ||
                (tap.tick !== prior.tick &&
                  tap.tick - prior.tick !== WARP_SPEC.tapWindowTicks + 1),
            ) &&
          (i < 2 ||
            (taps[i - 1]?.tick ?? 0) - (taps[i - 2]?.tick ?? 0) >
              WARP_SPEC.tapWindowTicks ||
            tap.tick - (taps[i - 1]?.tick ?? 0) > WARP_SPEC.tapWindowTicks),
      ),
    );
  await fc.assert(
    fc.asyncProperty(events, async (taps) => {
      const f = fixture();
      const results: Promise<boolean>[] = [];
      const useCase = new TapWarpBlock(
        { at: () => ({ drop() {}, remove() {}, showRemaining() {} }) },
        new RemoveWarpPoint(f.store),
        f.clock,
      );
      for (const tap of taps) {
        await f.clock.advanceTo(tap.tick);
        results.push(
          useCase.run({
            playerId: asPlayerId(`player-${tap.player}`),
            dimension: f.p.dimension,
            cell: f.p.cell,
            now: tap.tick,
          }),
        );
      }
      await f.clock.advanceTo(
        (taps.at(-1)?.tick ?? 0) + WARP_SPEC.tapWindowTicks + 1,
      );
      const expected = taps.map(
        (tap, i) =>
          !taps
            .slice(i + 1)
            .some(
              (later) =>
                later.player === tap.player &&
                later.tick - tap.tick <= WARP_SPEC.tapWindowTicks,
            ),
      );
      expect(await Promise.all(results)).toEqual(expected);
    }),
  );
});

it("cancels all pending players' taps when their shared count breaks the block", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
      ),
      fc.integer({ min: 1, max: WARP_SPEC.tapWindowTicks - 1 }),
      async (players, first) => {
        const f = fixture();
        await f.run(0, { playerId: asPlayerId(`player-${players[0]}`) });
        await f.run(first, { playerId: asPlayerId(`player-${players[1]}`) });
        await f.run(WARP_SPEC.tapWindowTicks, {
          playerId: asPlayerId(`player-${players[2]}`),
        });
        await f.clock.advanceTo(100);
        expect(f.counts()).toEqual({ drops: 1, removals: 1 });
        expect(f.settled).toHaveLength(3);
        expect(f.settled.every((open) => !open)).toBe(true);
      },
    ),
  );
});

it("breaks and removes the entry exactly once after three taps inside the window", async () => {
  await fc.assert(
    fc.asyncProperty(gap, gap, async (first, second) => {
      const f = fixture();
      await f.run(0);
      await f.run(first);
      await f.run(first + second);
      for (let i = 1; i <= 5; i++) await f.run(first + second + i);
      await f.clock.advanceTo(1000);
      expect(f.counts()).toEqual({ drops: 1, removals: 1 });
      expect(f.store.registry?.points).toEqual([]);
      expect(f.store.writes).toHaveLength(1);
      expect(f.settled.every((open) => !open)).toBe(true);
    }),
  );
});

it("opens the list once, for the last tap, when one or two taps settle", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 2 }), gap, async (count, g) => {
      const f = fixture();
      for (let i = 0; i < count; i++) await f.run(i * g);
      const last = (count - 1) * g;
      await f.clock.advanceTo(last + WARP_SPEC.tapWindowTicks);
      expect(f.settled).toEqual(count === 2 ? [false] : []);
      await f.clock.advanceTo(last + WARP_SPEC.tapWindowTicks + 1);
      expect(f.settled.filter(Boolean)).toHaveLength(1);
      expect(f.counts()).toEqual({ drops: 0, removals: 0 });
      expect(f.store.registry?.points).toHaveLength(1);
    }),
  );
});

it("starts the count again after a gap longer than the window", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: WARP_SPEC.tapWindowTicks + 1, max: 1000 }),
      async (g) => {
        const f = fixture();
        await f.run(0);
        await f.run(1);
        await f.run(1 + g);
        await f.run(2 + g);
        expect(f.counts()).toEqual({ drops: 0, removals: 0 });
        await f.run(3 + g);
        expect(f.counts()).toEqual({ drops: 1, removals: 1 });
      },
    ),
  );
});

it("counts taps from different players together", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++)
    await f.run(i, { playerId: asPlayerId(`player-${i}`) });
  expect(f.counts()).toEqual({ drops: 1, removals: 1 });
});

it("shows every remaining count, then the broken message", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) await f.run(i);
  expect(f.messages).toEqual([2, 1, "broken"]);
});

it.each(["dimension", "cell"])("isolates counters by %s", async (changed) => {
  const f = fixture({
    at: () => ({ drop() {}, showRemaining() {}, remove() {} }),
  });
  const other =
    changed === "dimension"
      ? { dimension: asDimensionId("minecraft:nether") }
      : { cell: { ...f.p.cell, x: f.p.cell.x + 1 } };
  await f.run(0);
  await f.run(1, other);
  await f.run(2, other);
  await f.run(3);
  expect(f.store.registry?.points).toEqual([f.p]);
  await f.run(4);
  expect(f.store.registry?.points).toEqual([]);
});

it("ignores taps when the player or block is gone", async () => {
  const f = fixture({ at: () => undefined });
  for (let i = 0; i < 3; i++) await f.run(i);
  await f.clock.advanceTo(1000);
  expect(f.settled).toEqual([false, false, false]);
  expect(f.store.registry?.points).toEqual([f.p]);
});

it("does not give an item or remove the registry entry when block removal fails", async () => {
  const p = point();
  const f = setup({ points: [p] });
  let drops = 0;
  const failure = new Error("setType failed");
  const tap = new TapWarpBlock(
    {
      at: () => ({
        drop() {
          drops++;
        },
        remove() {
          throw failure;
        },
        showRemaining() {},
      }),
    },
    new RemoveWarpPoint(f.store),
    new Clock(),
  );
  const run = (now: number) =>
    tap.run({ playerId: player, dimension: p.dimension, cell: p.cell, now });
  void run(0);
  void run(1);
  await expect(run(2)).rejects.toThrow(failure);
  expect(drops).toBe(0);
  expect(f.store.registry?.points).toEqual([p]);
});
