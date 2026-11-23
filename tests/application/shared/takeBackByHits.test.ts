import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { TakeBackByHits } from "../../../src/application/shared/takeBackByHits";
import { hitRule } from "../../../src/domain/shared/hitCounter";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { ticks } from "../../../src/domain/shared/ticks";

const player = asPlayerId("player");

describe("TakeBackByHits", () => {
  it.each([
    ["giveBack", "remove"],
    ["release", "giveBack", "remove"],
    ["giveBack", "release", "remove"],
    ["release", "remove", "giveBack"],
  ] as const)("runs the configured take-back order", (...order) => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.string(),
        (hits, start, id) => {
          const log: string[] = [];
          const giveBack = vi.fn(() => log.push("giveBack"));
          const remove = vi.fn(() => log.push("remove"));
          const release = vi.fn(() => log.push("release"));
          const remaining = vi.fn((_id, _player, left) =>
            log.push(`left${left}`),
          );
          const taken = vi.fn(() => log.push("taken"));
          const takeBack = new TakeBackByHits<string>({
            rule: hitRule(hits, ticks(40)),
            giveBack,
            remove,
            feedback: { remaining, taken },
            ...(order.length === 2 ? { order } : { order, release }),
          });
          for (let i = 0; i < hits - 1; i++)
            expect(takeBack.hit(id, start + i, player)).toBe("counted");
          expect(takeBack.hit(id, start + hits - 1, player)).toBe("taken");
          expect(log).toEqual([
            ...Array.from(
              { length: hits - 1 },
              (_, i) => `left${hits - 1 - i}`,
            ),
            ...order,
            "taken",
          ]);
          expect(giveBack).toHaveBeenCalledExactlyOnceWith(id, player);
          expect(remove).toHaveBeenCalledExactlyOnceWith(id);
          expect(taken).toHaveBeenCalledExactlyOnceWith(id, player);
          for (let i = 0; i < hits - 1; i++)
            expect(remaining).toHaveBeenNthCalledWith(
              i + 1,
              id,
              player,
              hits - 1 - i,
            );
        },
      ),
    );
  });

  it("resets the count exactly when a hit gap exceeds resetTicks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).map(ticks),
        fc.array(fc.integer({ min: -1, max: 1 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (resetTicks, offsets) => {
          const hits = offsets.length + 2;
          const log: number[] = [];
          const takeBack = new TakeBackByHits<string>({
            rule: hitRule(hits, resetTicks),
            giveBack: () => log.push(-1),
            remove: () => log.push(-2),
            feedback: { remaining: (_id, _player, left) => log.push(left) },
            order: ["giveBack", "remove"],
          });
          let tick = 0;
          let runLength = 1;
          const expected = [hits - 1];
          takeBack.hit("a", tick, player);
          for (const offset of offsets) {
            tick += resetTicks + offset;
            runLength = offset > 0 ? 1 : runLength + 1;
            expected.push(hits - runLength);
            takeBack.hit("a", tick, player);
          }
          expect(log).toEqual(expected);
        },
      ),
    );
  });

  it("skips refused hits without counting or extending the reset window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).map(ticks),
        fc.boolean(),
        (resetTicks, expires) => {
          let reason: "blocked" | undefined;
          const showRefusal = vi.fn();
          const remaining = vi.fn();
          const giveBack = vi.fn();
          const takeBack = new TakeBackByHits<string>({
            rule: hitRule(2, resetTicks),
            refusal: () => reason,
            showRefusal,
            giveBack,
            remove: vi.fn(),
            feedback: { remaining },
            order: ["giveBack", "remove"],
          });
          expect(takeBack.hit("a", 0, player)).toBe("counted");
          reason = "blocked";
          expect(takeBack.hit("a", resetTicks, player)).toBe("refused");
          expect(showRefusal).toHaveBeenCalledExactlyOnceWith(
            player,
            "blocked",
          );
          expect(remaining).toHaveBeenCalledExactlyOnceWith("a", player, 1);
          expect(giveBack).not.toHaveBeenCalled();
          reason = undefined;
          expect(takeBack.hit("a", resetTicks + Number(expires), player)).toBe(
            expires ? "counted" : "taken",
          );
        },
      ),
    );
  });

  it("counts by the configured key and gives the item to the final hitter", () => {
    fc.assert(
      fc.property(fc.string(), (key) => {
        const first = `first:${key}`;
        const second = `second:${key}`;
        const giveBack = vi.fn();
        const takeBack = new TakeBackByHits<{ key: string }>({
          rule: hitRule(2, ticks(40)),
          key: (target) => target.key,
          giveBack,
          remove: vi.fn(),
          feedback: { remaining: vi.fn() },
          order: ["giveBack", "remove"],
        });
        const finalTarget = { key: first };
        expect(takeBack.hit({ key: first }, 0, player)).toBe("counted");
        expect(takeBack.hit({ key: second }, 1, player)).toBe("counted");
        const finalPlayer = asPlayerId("final");
        expect(takeBack.hit(finalTarget, 2, finalPlayer)).toBe("taken");
        expect(giveBack).toHaveBeenCalledExactlyOnceWith(
          finalTarget,
          finalPlayer,
        );
        expect(takeBack.hit(finalTarget, 3, player)).toBe("counted");
      }),
    );
  });

  it("gives back a playerless item without showing player feedback", () => {
    const giveBack = vi.fn();
    const remaining = vi.fn();
    const taken = vi.fn();
    const showRefusal = vi.fn();
    const takeBack = new TakeBackByHits<string>({
      rule: hitRule(2, ticks(40)),
      refusal: (id) => (id === "blocked" ? "blocked" : undefined),
      showRefusal,
      giveBack,
      remove: vi.fn(),
      feedback: { remaining, taken },
      order: ["giveBack", "remove"],
    });
    expect(takeBack.hit("a", 0, undefined)).toBe("counted");
    expect(takeBack.hit("blocked", 1, undefined)).toBe("refused");
    expect(takeBack.hit("a", 2, undefined)).toBe("taken");
    expect(giveBack).toHaveBeenCalledExactlyOnceWith("a", undefined);
    expect(remaining).not.toHaveBeenCalled();
    expect(taken).not.toHaveBeenCalled();
    expect(showRefusal).not.toHaveBeenCalled();
  });
});
