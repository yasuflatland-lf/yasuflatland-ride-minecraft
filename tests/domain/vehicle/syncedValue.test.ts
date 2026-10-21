import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SyncedValue } from "../../../src/domain/vehicle/syncedValue";

function sends<T>(values: readonly T[]): (T | undefined)[] {
  const synced = new SyncedValue<T>();
  return values.map((v) => synced.next(v));
}

const smallOrUndefined = fc.oneof(
  fc.integer({ min: -3, max: 3 }),
  fc.constant(undefined),
);

describe("SyncedValue (ADR 0026, 0033, 0059)", () => {
  it("returns the value on the first call", () => {
    fc.assert(
      fc.property(smallOrUndefined, (v) => {
        expect(new SyncedValue<number | undefined>().next(v)).toBe(v);
      }),
    );
  });

  it("sends a later value if and only if it differs from the previous one", () => {
    fc.assert(
      fc.property(
        fc.array(smallOrUndefined, { minLength: 1, maxLength: 40 }),
        (values) => {
          const out = sends(values);
          expect(out).toHaveLength(values.length);
          expect(out[0]).toBe(values[0]);
          for (let i = 1; i < values.length; i++) {
            expect(out[i]).toBe(
              values[i] !== values[i - 1] ? values[i] : undefined,
            );
          }
        },
      ),
    );
  });

  it("sends a repeated value only once", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.integer({ min: 1, max: 20 }), (b, n) => {
        const values: boolean[] = Array.from({ length: n }, () => b);
        expect(sends(values)).toEqual([
          b,
          ...Array.from({ length: n - 1 }, () => undefined),
        ]);
      }),
    );
  });

  it("starts over in a fresh instance, as a vehicle rebuilt after /reload does", () => {
    fc.assert(
      fc.property(
        fc.array(smallOrUndefined, { minLength: 1, maxLength: 40 }),
        (values) => {
          const before = sends(values);
          const after = sends(values);
          expect(after[0]).toBe(values[0]);
          expect(after).toEqual(before);
        },
      ),
    );
  });
});
