import { readFileSync } from "node:fs";

interface ResortGearPiece {
  readonly name: string;
  readonly item: string;
  readonly geometry: string;
  readonly texture?: string;
  readonly textured: boolean;
  readonly cutout: boolean;
}

// tools/resort_gear.json is the one ordered list of Resort Gear members; pack
// tests derive their catalog and preview lists from it instead of repeating
// the names.
export const RESORT_GEAR: readonly ResortGearPiece[] = JSON.parse(
  readFileSync("tools/resort_gear.json", "utf8"),
);

/** The creative catalog's `resort_gear` items, in display order. */
export const RESORT_CATALOG_ITEMS: readonly string[] = RESORT_GEAR.map(
  (piece) => `yasu_ride:${piece.item}`,
);
