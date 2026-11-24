// Items set out in the camper's room and saved on the camper (ADR 0093).
import type { Brand } from "../../../shared/ids";

import { asCampingGear, type CampingGearId } from "./campingGear.ts";

export type DecorSlotId = Brand<string, "DecorSlotId">;
export type DecorItemId = CampingGearId;

/** One decor item in one slot; `item` is a gear id without the namespace. */
export interface DecorPlacement {
  readonly slot: DecorSlotId;
  readonly item: DecorItemId;
}

/**
 * What a press on storage with doors did: opened or closed a door, or took an item out of an
 * open compartment (ADR 0114, 0121).
 */
export type StoragePress =
  | { readonly kind: "door" }
  | { readonly kind: "item"; readonly item: DecorItemId };

// Saved slots may be empty or name removed furniture; keep them for restoration.
export function parseDecorSlotId(raw: string): DecorSlotId | undefined {
  return typeof raw === "string" ? (raw as DecorSlotId) : undefined;
}

/**
 * Parses the saved decor. Anything malformed reads as no decor; an entry
 * without a string slot or with an invalid item is dropped.
 */
export function parseDecor(saved: unknown): DecorPlacement[] {
  if (typeof saved !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const decor: DecorPlacement[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { slot: rawSlot, item: rawItem } = entry as Record<string, unknown>;
    const slot =
      typeof rawSlot === "string" ? parseDecorSlotId(rawSlot) : undefined;
    const item = asCampingGear(rawItem);
    if (slot === undefined || item === undefined) continue;
    decor.push({ slot, item });
  }
  return decor;
}

/** The saved form of the decor; undefined (property removed) when there is none. */
export function serializeDecor(
  decor: readonly DecorPlacement[],
): string | undefined {
  return decor.length > 0
    ? JSON.stringify(decor.map(({ slot, item }) => ({ slot, item })))
    : undefined;
}
