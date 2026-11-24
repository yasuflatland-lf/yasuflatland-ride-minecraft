import fc from "fast-check";
import { expect, it } from "vitest";
import {
  canFoldFirePit,
  canToggleFirePit,
} from "../../../src/domain/camp/firePit";

it("allows any tap to extinguish a fire and requires an igniter to light it", () => {
  fc.assert(
    fc.property(fc.boolean(), (holdsIgniter) => {
      expect(canToggleFirePit(true, holdsIgniter)).toBe(true);
      expect(canToggleFirePit(false, holdsIgniter)).toBe(holdsIgniter);
    }),
  );
});

it("allows folding exactly when uncovered", () => {
  fc.assert(
    fc.property(fc.boolean(), (covered) => {
      expect(canFoldFirePit(covered)).toBe(!covered);
    }),
  );
});
