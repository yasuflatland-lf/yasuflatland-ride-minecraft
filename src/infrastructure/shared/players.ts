// Inventory and game mode helpers for any feature that hands items to players or takes them back.
import { GameMode, type ItemStack, type Player } from "@minecraft/server";

/** Takes one item from `slot`, but only if it still holds `typeId` (ADR 0024). */
export function consumeHeld(
  player: Player,
  typeId: string,
  slot: number,
): boolean {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return false;
  const item = inv.getItem(slot);
  if (!item || item.typeId !== typeId) return false;
  if (item.amount > 1) {
    item.amount -= 1;
    inv.setItem(slot, item);
  } else {
    inv.setItem(slot, undefined);
  }
  return true;
}

/** Adds each item to the inventory and drops what does not fit at the player's feet. */
export function giveOrDrop(player: Player, items: readonly ItemStack[]): void {
  const inv = player.getComponent("minecraft:inventory")?.container;
  for (const item of items) {
    const leftover = inv ? inv.addItem(item) : item;
    if (leftover) player.dimension.spawnItem(leftover, player.location);
  }
}

/** Whether the player is in Creative; false for a missing player. */
export function isCreative(player: Player | undefined): boolean {
  // getGameMode throws on a handle whose player has left (isValid false).
  return player?.isValid === true && player.getGameMode() === GameMode.Creative;
}
