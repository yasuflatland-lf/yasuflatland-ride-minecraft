import fc from "fast-check";
import { expect, it } from "vitest";
import {
  seconds,
  TICKS_PER_SECOND,
  ticks,
} from "../../../src/domain/shared/ticks";

it("ticks accepts exactly the non-negative integers", () => {
  fc.assert(
    fc.property(fc.double({ noNaN: false }), (n) => {
      const valid = Number.isInteger(n) && n >= 0;
      if (valid) expect(ticks(n)).toBe(n);
      else expect(() => ticks(n)).toThrow(RangeError);
    }),
  );
  fc.assert(
    fc.property(fc.nat(), (n) => {
      expect(ticks(n)).toBe(n);
    }),
  );
});

it("seconds converts whole seconds to twenty ticks each", () => {
  fc.assert(
    fc.property(fc.nat(100000), (s) => {
      expect(seconds(s)).toBe(s * TICKS_PER_SECOND);
    }),
  );
});
