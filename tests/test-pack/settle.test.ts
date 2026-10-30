import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { settledAt } from "../../src/test-pack/settle";

const samples = fc.array(fc.integer({ min: -10, max: 10 }), { maxLength: 100 });
const threshold = fc.integer({ min: -10, max: 10 });
const run = fc.integer({ min: 1, max: 10 });

describe("settledAt", () => {
  it("returns the first completed run and never fires on an earlier prefix", () => {
    fc.assert(
      fc.property(samples, threshold, run, (values, limit, length) => {
        const first = values.findIndex(
          (_, i) =>
            i + 1 >= length &&
            values.slice(i + 1 - length, i + 1).every((value) => value < limit),
        );
        const result = settledAt(values, limit, length);
        expect(result).toBe(first < 0 ? undefined : first);
        for (let end = 0; end <= (result ?? values.length); end++) {
          expect(
            settledAt(values.slice(0, end), limit, length),
          ).toBeUndefined();
        }
      }),
    );
  });

  it("shifts completion by the length of a prefix at or above the threshold", () => {
    fc.assert(
      fc.property(
        samples,
        threshold,
        run,
        fc.array(fc.nat({ max: 10 }), { maxLength: 20 }),
        (values, limit, length, offsets) => {
          const result = settledAt(values, limit, length);
          const prefixed = [
            ...offsets.map((offset) => limit + offset),
            ...values,
          ];
          expect(settledAt(prefixed, limit, length)).toBe(
            result === undefined ? undefined : result + offsets.length,
          );
        },
      ),
    );
  });

  it("completes a guaranteed run only after all its samples arrive", () => {
    fc.assert(
      fc.property(
        threshold,
        run,
        fc.nat({ max: 20 }),
        (limit, length, prefix) => {
          const values = [
            ...Array<number>(prefix).fill(limit),
            ...Array<number>(length).fill(limit - 1),
          ];
          expect(settledAt(values, limit, length)).toBe(prefix + length - 1);
        },
      ),
    );
  });
});
