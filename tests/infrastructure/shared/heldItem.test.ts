import type { Player } from "@minecraft/server";
import fc from "fast-check";
import { expect, it } from "vitest";
import { heldTypeId } from "../../../src/infrastructure/shared/heldItem";

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
