import type { FurnitureKind } from "../../domain/resort/furniture";
import { id } from "../shared/identifiers";

export const BEACH_PARASOL = id("beach_parasol");
export const BEACH_PARASOL_ITEM = id("beach_parasol_item");
export const BEACH_PARASOL_STARTER_RECEIVED_PROPERTY = id(
  "beach_parasol_starter_received",
);
export const PARASOL_CEILING_BLOCK = id("parasol_ceiling");
export const PARASOL_CEILING_PROPERTY = id("parasol_ceiling");

export const TEST_PARASOL_PLACE = id("test_parasol_place");
export const TEST_PARASOL_HIT = id("test_parasol_hit");

export const BEACH_CHAIR = id("beach_chair");
export const BEACH_CHAIR_ITEM = id("beach_chair_item");
export const BEACH_CHAIR_FOLDED = id("folded");
export const TEST_BEACH_CHAIR_PLACE = id("test_beach_chair_place");
export const TEST_BEACH_CHAIR_HIT = id("test_beach_chair_hit");

export const TEST_BEACH_CHAIR_FORM = id("test_beach_chair_form");

export const BEACH_CHAIR_FOLD_EVENT = id("beach_chair_fold");
export const BEACH_CHAIR_UNFOLD_EVENT = id("beach_chair_unfold");

export const BEACH_CHAIR_TOP_REFUSAL_HINTS = {
  full: "yasu_ride.beach_chair_top_full",
  overlap: "yasu_ride.beach_chair_top_overlap",
  tooBig: "yasu_ride.beach_chair_top_too_big",
} as const;

export const BEACH_CHAIR_LOUNGE_ANIMATION = "animation.yasu_ride.player.lounge";
export const BEACH_CHAIR_LOUNGE_CONTROLLER = "yasu_ride.lounge";

export const FURNITURE_IDS: Record<
  FurnitureKind,
  { entity: string; item: string }
> = {
  dining_table: { entity: id("dining_table"), item: id("dining_table_item") },
  dining_chair: { entity: id("dining_chair"), item: id("dining_chair_item") },
  sofa_single: { entity: id("sofa_single"), item: id("sofa_single_item") },
  sofa_double: { entity: id("sofa_double"), item: id("sofa_double_item") },
};

export const TEST_FURNITURE_PLACE = "yasu_ride_test:test_furniture_place";
export const TEST_FURNITURE_HIT = "yasu_ride_test:test_furniture_hit";

export function furnitureKindOf(
  typeId: string,
  field: "entity" | "item",
): FurnitureKind | undefined {
  return (Object.keys(FURNITURE_IDS) as FurnitureKind[]).find(
    (kind) => FURNITURE_IDS[kind][field] === typeId,
  );
}

export const DINING_TABLE_TOP_REFUSAL_HINTS = {
  full: "yasu_ride.dining_table_top_full",
  overlap: "yasu_ride.dining_table_top_overlap",
  tooBig: "yasu_ride.dining_table_top_too_big",
} as const;

export const DINING_TABLE_TOP = id("dining_table_top");
export const FURNITURE_TOP_CELLS = id("top_cells");
