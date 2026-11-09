import {
  CAMP_TABLE_TOP,
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
  TABLE_SPOTS,
} from "../../../domain/camp/spec";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_TYPE,
  GAS_LANTERN_HOST_PROPERTY,
  GAS_LANTERN_TYPE,
  TABLE_TOP_REFUSAL_HINTS,
} from "../identifiers";

export function registerCampTopHosts(registry: TopHostRegistry): void {
  registry.registerHost({
    hostType: "camp_table",
    entityTypeId: CAMP_TABLE_TYPE,
    surface: CAMP_TABLE_TOP,
    isTopNow: () => true,
    refusalHints: TABLE_TOP_REFUSAL_HINTS,
    legacySpot: (spot) => TABLE_SPOTS[spot],
  });
  registry.registerHosted({
    kind: "dutch_oven",
    entityTypeId: DUTCH_OVEN_TYPE,
    hostProperty: DUTCH_OVEN_HOST_PROPERTY,
    footprint: DUTCH_OVEN_FOOTPRINT_PX,
  });
  registry.registerHosted({
    kind: "gas_lantern",
    entityTypeId: GAS_LANTERN_TYPE,
    hostProperty: GAS_LANTERN_HOST_PROPERTY,
    footprint: GAS_LANTERN_FOOTPRINT_PX,
  });
}
