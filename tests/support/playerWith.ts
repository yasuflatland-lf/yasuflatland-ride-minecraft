import type { Player } from "@minecraft/server";
import { expect } from "vitest";

export function playerWith(
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
