// The camping gear catalog, copied from tools/camping_gear.json (ADR 0093, 0097);
// tests/domain/vehicle/kinds/camper/campingGear.test.ts keeps the two equal.

/** Every camping gear id, in the order of tools/camping_gear.json. */
const CAMPING_GEAR_CATALOG = Object.freeze([
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
  "transistor_radio",
  "book_stack",
  "road_map",
  "photo_frame",
  "cushion",
  "tissue_box",
  "desk_fan",
  "alarm_clock",
  "instant_camera",
  "binoculars",
] as const);

export type CampingGearId = (typeof CAMPING_GEAR_CATALOG)[number];
export const CAMPING_GEAR_IDS: readonly CampingGearId[] = CAMPING_GEAR_CATALOG;

/** The gear that hangs from the ceiling hook; every other item stands (ADR 0097). */
export const HANGING_GEAR_IDS: ReadonlySet<CampingGearId> = new Set([
  "macrame_planter",
]);

/**
 * The gear that stands, in catalog order: what a pair block, the table's or a compartment's, can
 * draw at each end; its yasu_ride:end<n> code is 1 + the index here, 0 for an empty end (ADR 0108).
 */
export const STANDING_GEAR_IDS: readonly CampingGearId[] = Object.freeze(
  CAMPING_GEAR_IDS.filter((id) => !HANGING_GEAR_IDS.has(id)),
);

/** Saved catalog ids: null drops removed gear without returning an item (ADR 0169, 0173). */
export const LEGACY_GEAR_IDS: Readonly<Record<string, CampingGearId | null>> = {
  lava_lamp: null,
  oil_lamp: null,
  lantern: null,
};

export function asCampingGear(raw: unknown): CampingGearId | undefined {
  if (typeof raw !== "string") return undefined;
  if (Object.hasOwn(LEGACY_GEAR_IDS, raw))
    return LEGACY_GEAR_IDS[raw] ?? undefined;
  return CAMPING_GEAR_IDS.find((gear) => gear === raw);
}
