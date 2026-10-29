import { BlockPermutation } from "@minecraft/server";
import type { RiderHeld } from "../../../domain/vehicle/vehicle";
import { bareId } from "../../shared/identifiers";

const namesBlock = new Map<string, boolean>();

/** The item ID itself when it also names a block; cached because resolve throws for items (ADR 0181). */
function blockOfItem(itemTypeId: string): string | undefined {
  let isBlock = namesBlock.get(itemTypeId);
  if (isBlock === undefined) {
    try {
      BlockPermutation.resolve(itemTypeId);
      isBlock = true;
    } catch {
      isBlock = false;
    }
    namesBlock.set(itemTypeId, isBlock);
  }
  return isBlock ? itemTypeId : undefined;
}

/** Both projections of one selected item ID, shared by players and test input (ADR 0139, 0181). */
export function riderHeldOf(typeId: string | undefined): RiderHeld | undefined {
  if (typeId === undefined) return undefined;
  return { tool: bareId(typeId), block: blockOfItem(typeId) };
}
