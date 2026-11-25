import type { Container, Player } from "@minecraft/server";
import type { NavWorld } from "../../../application/vehicle/ports/drive";
import type { NavDestination } from "../../../domain/vehicle/navigation/destinations";
import {
  countFilledMaps,
  deliveryOf,
  type MapDelivery,
} from "../../shared/filledMaps";
import { navLootTableId } from "./identifiers";

function countInventoryFilledMaps(inventory: Container): number {
  const items = Array.from({ length: inventory.size }, (_, slot) =>
    inventory.getItem(slot),
  );
  return countFilledMaps(items);
}

export function giveExplorerMap(
  player: Player,
  destination: NavDestination,
): MapDelivery<ReturnType<NavWorld["giveMap"]>> {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const path = inventory?.emptySlotsCount === 0 ? "spawn" : "give";
  const target = path === "spawn" ? "spawn ~ ~ ~" : "give @s";
  const countedInventory = path === "give" ? inventory : undefined;
  const before = countedInventory && countInventoryFilledMaps(countedInventory);
  player.runCommand(
    `execute at @s run loot ${target} loot "${navLootTableId(destination)}"`,
  );
  const after = countedInventory && countInventoryFilledMaps(countedInventory);
  return { path, before, after, result: deliveryOf(before, after) };
}
