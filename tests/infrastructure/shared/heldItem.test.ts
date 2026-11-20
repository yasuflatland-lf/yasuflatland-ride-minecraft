import fc from "fast-check";
import { expect, it } from "vitest";
import { heldTypeId } from "../../../src/infrastructure/shared/heldItem";
import { playerWith } from "../../support/playerWith";

it("returns the type id from the selected slot", () => {
  fc.assert(
    fc.property(fc.string(), fc.integer({ min: 0, max: 8 }), (typeId, slot) => {
      expect(heldTypeId(playerWith(typeId, slot))).toBe(typeId);
    }),
  );
});

it("returns undefined for an empty slot or missing inventory", () => {
  expect(heldTypeId(playerWith(undefined, 3))).toBeUndefined();
  expect(heldTypeId(playerWith("minecraft:stick", 3, false))).toBeUndefined();
});
