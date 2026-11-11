import fc from "fast-check";
import { expect, it } from "vitest";
import { soundId } from "../../../src/domain/shared/soundId";

const PATTERN = /^[a-z0-9_.]+$/;

it("soundId accepts strings of the allowed characters", () => {
  const allowed = fc.stringMatching(PATTERN);
  fc.assert(
    fc.property(allowed, (s) => {
      expect(soundId(s)).toBe(s);
    }),
  );
});

it("soundId rejects every other string", () => {
  fc.assert(
    fc.property(
      fc.string().filter((s) => !PATTERN.test(s)),
      (s) => {
        expect(() => soundId(s)).toThrow(RangeError);
      },
    ),
  );
});
