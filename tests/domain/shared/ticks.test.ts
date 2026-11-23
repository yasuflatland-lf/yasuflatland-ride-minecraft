import fc from "fast-check";
import { expect, it } from "vitest";
import { seconds, ticks } from "../../../src/domain/shared/ticks";

it("ticks accepts exactly the non-negative integers", () => {
  fc.assert(
    fc.property(fc.oneof(fc.double(), fc.nat()), (n) => {
      const valid = Number.isInteger(n) && n >= 0;
      if (valid) expect(ticks(n)).toBe(n);
      else expect(() => ticks(n)).toThrow(RangeError);
    }),
  );
});

it("seconds converts whole seconds to twenty ticks each", () => {
  fc.assert(
    fc.property(fc.nat(100000), (s) => {
      expect(seconds(s)).toBe(s * 20);
    }),
  );
});
