import { BlockPermutation } from "@minecraft/server";
import type { RiderHeld } from "../../../domain/vehicle/vehicle";
import { bareId } from "../../shared/identifiers";

const blocks = new Map<string, string | null>();

/** The item ID itself when it also names a block; cached because resolve throws for items (ADR 0181). */
function blockOfItem(itemTypeId: string | undefined): string | undefined {
  if (itemTypeId === undefined) return undefined;
  const cached = blocks.get(itemTypeId);
  if (cached !== undefined) return cached ?? undefined;
  try {
    BlockPermutation.resolve(itemTypeId);
    blocks.set(itemTypeId, itemTypeId);
    return itemTypeId;
  } catch {
    blocks.set(itemTypeId, null);
    return undefined;
  }
}

/** Both projections of one selected item ID, shared by players and test input (ADR 0139, 0181). */
export function riderHeldOf(typeId: string | undefined): RiderHeld | undefined {
  if (typeId === undefined) return undefined;
  return { tool: bareId(typeId), block: blockOfItem(typeId) };
}
