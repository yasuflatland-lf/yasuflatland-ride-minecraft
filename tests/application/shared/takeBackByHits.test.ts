import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handleHit } from "../../../src/application/shared/takeBackByHits";
import { HitCounters } from "../../../src/domain/shared/hitCounter";

describe("handleHit", () => {
  it("drops and removes once on the last hit of a quick run, showing the count before", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 1000 }),
        (hits, start) => {
          const rule = { hits, resetTicks: 40 };
          const counters = new HitCounters<string>(rule);
          const log: string[] = [];
          const effects = {
            drop: () => log.push("drop"),
            remove: () => log.push("remove"),
            showRemaining: (n: number) => log.push(`left${n}`),
          };
          for (let i = 0; i < hits; i++)
            handleHit(counters, "a", start + i, effects);
          const expected = [
            ...Array.from(
              { length: hits - 1 },
              (_, i) => `left${hits - 1 - i}`,
            ),
            "drop",
            "remove",
          ];
          expect(log).toEqual(expected);
        },
      ),
    );
  });

  it("starts counting again after a gap longer than resetTicks", () => {
    const rule = { hits: 3, resetTicks: 40 };
    const counters = new HitCounters<string>(rule);
    const log: number[] = [];
    const effects = {
      drop: () => log.push(-1),
      remove: () => {},
      showRemaining: (n: number) => log.push(n),
    };
    handleHit(counters, "a", 0, effects);
    handleHit(counters, "a", 100, effects);
    expect(log).toEqual([2, 2]);
  });
});
