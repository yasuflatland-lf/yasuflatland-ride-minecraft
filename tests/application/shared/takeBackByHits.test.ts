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

  it("resets the count exactly when a hit gap exceeds resetTicks", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.array(fc.integer({ min: -1, max: 1 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (resetTicks, offsets) => {
          const hits = offsets.length + 2;
          const counters = new HitCounters<string>({ hits, resetTicks });
          const log: number[] = [];
          const effects = {
            drop: () => log.push(-1),
            remove: () => log.push(-2),
            showRemaining: (n: number) => log.push(n),
          };
          let tick = 0;
          let runLength = 1;
          const expected = [hits - 1];
          handleHit(counters, "a", tick, effects);
          for (const offset of offsets) {
            tick += resetTicks + offset;
            runLength = offset > 0 ? 1 : runLength + 1;
            expected.push(hits - runLength);
            handleHit(counters, "a", tick, effects);
          }
          expect(log).toEqual(expected);
        },
      ),
    );
  });
});
