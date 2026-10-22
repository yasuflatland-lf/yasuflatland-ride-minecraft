// The camping gear catalog, copied from tools/camping_gear.json (ADR 0093, 0097);
// tests/domain/vehicle/kinds/camper/campingGear.test.ts keeps the two equal.

/** Every camping gear id, in the order of tools/camping_gear.json. */
export const CAMPING_GEAR_IDS: readonly string[] = Object.freeze([
  "potted_plant",
  "macrame_planter",
  "cactus_pot",
  "percolator",
  "enamel_kettle",
  "saucepan",
  "mug_pair",
  "sugar_pot",
  "fruit_bowl",
  "toaster",
  "oil_lamp",
  "lava_lamp",
  "transistor_radio",
  "book_stack",
  "road_map",
  "photo_frame",
  "cushion",
  "tissue_box",
  "desk_fan",
]);

/** The gear that hangs from the ceiling hook; every other item stands (ADR 0097). */
export const HANGING_GEAR_IDS: ReadonlySet<string> = new Set([
  "macrame_planter",
]);

/**
 * The gear that stands, in catalog order: what a shelf board's or the table's pair block can
 * draw at each end; its yasu_ride:end<n> code is 1 + the index here, 0 for an empty end (ADR 0108).
 */
export const STANDING_GEAR_IDS: readonly string[] = Object.freeze(
  CAMPING_GEAR_IDS.filter((id) => !HANGING_GEAR_IDS.has(id)),
);
