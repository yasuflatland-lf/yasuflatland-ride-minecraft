// Items a player set out in a held vehicle's room, saved on the vehicle (ADR 0093).
import type { Face } from "./floor";

const QUARTER_TURN = 90;
const ITEM_ID = /^[a-z][a-z0-9_]*$/;

/** One decor item in one slot; `item` is a gear id without the namespace. */
export interface DecorPlacement {
  readonly slot: string;
  readonly item: string;
}

/**
 * What a press on storage with doors did: opened or closed a door, or took an item out of an
 * open compartment (ADR 0114, 0121).
 */
export type StoragePress =
  | { readonly kind: "door" }
  | { readonly kind: "item"; readonly item: string };

export function isDecorItem(item: string): boolean {
  return ITEM_ID.test(item);
}

/** The quarter turn of a snapped yaw: 0 at yaw 0, 1 at 90, 2 at 180, 3 at -90 (yasu_ride:face of a decor block). */
export function decorFace(yaw: number): Face {
  return (((Math.round(yaw / QUARTER_TURN) % 4) + 4) % 4) as Face;
}

/**
 * Parses the saved decor. Anything malformed reads as no decor; an entry
 * without a string slot or with an invalid item is dropped, and a repeated
 * slot keeps its first entry.
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
  const seen = new Set<string>();
  const decor: DecorPlacement[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { slot, item } = entry as Record<string, unknown>;
    if (
      typeof slot !== "string" ||
      typeof item !== "string" ||
      !isDecorItem(item) ||
      seen.has(slot)
    )
      continue;
    seen.add(slot);
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
