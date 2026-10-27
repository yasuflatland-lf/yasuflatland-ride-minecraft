import fc from "fast-check";
import { expect, it } from "vitest";
import { canFoldFirePit } from "../../../src/domain/camp/firePit";

it("allows folding exactly when uncovered", () => {
  fc.assert(
    fc.property(fc.boolean(), (covered) => {
      expect(canFoldFirePit(covered)).toBe(!covered);
    }),
  );
});
