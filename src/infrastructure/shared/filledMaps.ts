import type { ItemStack } from "@minecraft/server";

export function countFilledMaps(
  items: readonly (Pick<ItemStack, "typeId" | "amount"> | undefined)[],
): number {
  let count = 0;
  for (const item of items) {
    if (item?.typeId === "minecraft:filled_map") count += item.amount;
  }
  return count;
}
