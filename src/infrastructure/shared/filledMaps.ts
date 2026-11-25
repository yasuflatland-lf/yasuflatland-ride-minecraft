import type { ItemStack } from "@minecraft/server";

type DeliveryResult = ReturnType<typeof deliveryOf>;

export interface MapDelivery<Result extends DeliveryResult = DeliveryResult> {
  result: Result;
  path: "give" | "spawn";
  before?: number;
  after?: number;
}

export function deliveryOf(
  before: number | undefined,
  after: number | undefined,
) {
  if (before === undefined || after === undefined) return "unknown";
  return after > before ? "given" : "nothing";
}

export function countFilledMaps(
  items: readonly (Pick<ItemStack, "typeId" | "amount"> | undefined)[],
): number {
  let count = 0;
  for (const item of items) {
    if (item?.typeId === "minecraft:filled_map") count += item.amount;
  }
  return count;
}
