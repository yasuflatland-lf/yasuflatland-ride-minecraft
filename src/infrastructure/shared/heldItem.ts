import type { Player } from "@minecraft/server";

/** The type id of the item in the player's selected hotbar slot, if any; the one read every held-item check shares. */
export function heldTypeId(player: Player): string | undefined {
  return player
    .getComponent("minecraft:inventory")
    ?.container?.getItem(player.selectedSlotIndex)?.typeId;
}
