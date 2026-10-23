import type { Player } from "@minecraft/server";
import fc from "fast-check";
import { expect, it } from "vitest";
import { PAINTS } from "../../../src/domain/shared/paint";
import {
  dyeOf,
  heldDye,
  PAINT_BY_DYE,
} from "../../../src/infrastructure/shared/dyes";

function playerWith(
  typeId: string | undefined,
  slot: number,
  inventory = true,
): Player {
  return {
    selectedSlotIndex: slot,
    getComponent: (name: string) => {
      expect(name).toBe("minecraft:inventory");
      return inventory
        ? {
            container: {
              getItem: (index: number) => {
                expect(index).toBe(slot);
                return typeId === undefined ? undefined : { typeId };
              },
            },
          }
        : undefined;
    },
  } as unknown as Player;
}

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

it("returns undefined for a non-dye, empty slot, or missing inventory", () => {
  for (const player of [
    playerWith("minecraft:stick", 3),
    playerWith(undefined, 3),
    playerWith("minecraft:red_dye", 3, false),
  ])
    expect(heldDye(player)).toBeUndefined();
});
