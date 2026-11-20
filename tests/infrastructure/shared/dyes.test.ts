import fc from "fast-check";
import { expect, it } from "vitest";
import { PAINTS } from "../../../src/domain/shared/paint";
import {
  dyeOf,
  heldDye,
  PAINT_BY_DYE,
} from "../../../src/infrastructure/shared/dyes";
import { playerWith } from "../../support/playerWith";

it("maps every paint to a distinct dye and back", () => {
  fc.assert(
    fc.property(fc.constantFrom(...PAINTS), (paint) => {
      expect(PAINT_BY_DYE[dyeOf(paint)]).toBe(paint);
    }),
  );
  expect(new Set(PAINTS.map(dyeOf)).size).toBe(16);
  expect(dyeOf("khaki")).toBe("minecraft:brown_dye");
});

it("reads any dye from the selected slot", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...Object.entries(PAINT_BY_DYE)),
      fc.integer({ min: 0, max: 8 }),
      ([dye, paint], slot) => {
        expect(heldDye(playerWith(dye, slot))).toBe(paint);
      },
    ),
  );
});

it("rejects a held item that is not a dye", () => {
  expect(heldDye(playerWith("minecraft:stick", 3))).toBeUndefined();
});
