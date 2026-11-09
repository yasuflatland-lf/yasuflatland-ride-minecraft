import fc from "fast-check";
import { expect, it } from "vitest";
import { structureHandle } from "../../../src/domain/build/structure/handle";

it("returns a non-empty string unchanged", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (raw) => {
      expect(structureHandle(raw)).toBe(raw);
    }),
  );
});

it("rejects the empty string", () => {
  expect(() => structureHandle("")).toThrow();
});
