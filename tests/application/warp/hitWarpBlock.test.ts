import fc from "fast-check";
import { expect, it } from "vitest";
import { HitWarpBlock } from "../../../src/application/warp/hitWarpBlock";
import { RemoveWarpPoint } from "../../../src/application/warp/removeWarpPoint";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { player, point, setup } from "./fakes";

function fixture() {
  const p = point();
  const f = setup({ points: [p] });
  let present = true;
  let drops = 0;
  let removals = 0;
  const messages: (number | string)[] = [];
  const hit = new HitWarpBlock(
    {
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
  );
  const run = (now: number, playerId = player) =>
    hit.run({ playerId, dimension: p.dimension, cell: p.cell, now });
  return { ...f, run, messages, counts: () => ({ drops, removals }) };
}

it("breaks and removes the entry exactly once after five consecutive hits", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: WARP_SPEC.breakResetTicks }), {
        minLength: 4,
        maxLength: 4,
      }),
      (gaps) => {
        const f = fixture();
        let now = 0;
        f.run(now);
        for (const gap of gaps) {
          now += gap;
          f.run(now);
        }
        for (let i = 1; i <= 10; i++) f.run(now + i);
        expect(f.counts()).toEqual({ drops: 1, removals: 1 });
        expect(f.store.registry?.points).toEqual([]);
        expect(f.store.writes).toHaveLength(1);
      },
    ),
  );
});

it("never breaks in the first four hits, even across players", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 4 }), (count) => {
      const f = fixture();
      for (let i = 0; i < count; i++) f.run(i, asPlayerId(`player-${i}`));
      expect(f.counts()).toEqual({ drops: 0, removals: 0 });
      expect(f.store.registry?.points).toHaveLength(1);
      for (let i = count; i < 5; i++) f.run(i, asPlayerId(`player-${i}`));
      expect(f.counts()).toEqual({ drops: 1, removals: 1 });
    }),
  );
});

it("restarts after a gap longer than the reset window", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: WARP_SPEC.breakResetTicks + 1, max: 10000 }),
      (count, gap) => {
        const f = fixture();
        for (let i = 0; i < count; i++) f.run(i);
        for (let i = 0; i < 4; i++) f.run(count - 1 + gap + i);
        expect(f.counts()).toEqual({ drops: 0, removals: 0 });
        f.run(count - 1 + gap + 4);
        expect(f.counts()).toEqual({ drops: 1, removals: 1 });
      },
    ),
  );
});

it("shows every remaining count, then the broken message", () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) f.run(i);
  expect(f.messages).toEqual([4, 3, 2, 1, "broken"]);
});

it.each(["dimension", "cell"])("isolates counters by %s", (changed) => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 4 }), (count) => {
      const p = point();
      const f = setup({ points: [p] });
      const removals: string[] = [];
      const hit = new HitWarpBlock(
        {
          at: (_player, dimension, cell) => ({
            drop() {},
            showRemaining() {},
            remove() {
              removals.push(`${dimension}:${cell.x}`);
            },
          }),
        },
        new RemoveWarpPoint(f.store),
      );
      const base = { playerId: player, dimension: p.dimension, cell: p.cell };
      const other = {
        ...base,
        ...(changed === "dimension"
          ? { dimension: asDimensionId("minecraft:nether") }
          : { cell: { ...p.cell, x: p.cell.x + 1 } }),
      };
      for (let i = 0; i < count; i++) hit.run({ ...base, now: i });
      for (let i = 0; i < 4; i++) hit.run({ ...other, now: count + i });
      expect(removals).toEqual([]);
      for (let i = count; i < 5; i++) hit.run({ ...base, now: count + 4 + i });
      expect(removals).toEqual([`${p.dimension}:${p.cell.x}`]);
      expect(f.store.registry?.points).toEqual([]);
    }),
  );
});
