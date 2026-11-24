import {
  CAMP_TABLE_HOST_TYPE,
  campTableLegacySpot,
} from "../../../application/camp/hostedKind";
import type {
  HostedItemKind,
  HostedKindId,
} from "../../../application/shared/ports/hostedItem";
import {
  CAMP_TABLE_TOP,
  DUTCH_OVEN_FOOTPRINT_PX,
  DUTCH_OVEN_SPEC,
  GAS_LANTERN_FOOTPRINT_PX,
  GAS_LANTERN_SPEC,
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

export const DUTCH_OVEN_ON_TOP: HostedItemKind = {
  id: "dutch_oven" as HostedKindId,
  footprint: DUTCH_OVEN_FOOTPRINT_PX,
  clearance: DUTCH_OVEN_SPEC.clearance,
  refuses: DUTCH_OVEN_SPEC.refuses,
};

export const GAS_LANTERN_ON_TOP: HostedItemKind = {
  id: "gas_lantern" as HostedKindId,
  footprint: GAS_LANTERN_FOOTPRINT_PX,
  clearance: GAS_LANTERN_SPEC.tableClearance,
  refuses: GAS_LANTERN_SPEC.refuses,
};

export function registerCampTopHosts(registry: TopHostRegistry): void {
  registry.registerHost({
    hostType: CAMP_TABLE_HOST_TYPE,
    entityTypeId: CAMP_TABLE_TYPE,
    surface: CAMP_TABLE_TOP,
    isTopNow: () => true,
    refusalHints: TABLE_TOP_REFUSAL_HINTS,
    legacySpot: campTableLegacySpot,
  });
  registry.registerHosted({
    kind: DUTCH_OVEN_ON_TOP.id,
    entityTypeId: DUTCH_OVEN_TYPE,
    hostProperty: DUTCH_OVEN_HOST_PROPERTY,
    footprint: DUTCH_OVEN_ON_TOP.footprint,
  });
  registry.registerHosted({
    kind: GAS_LANTERN_ON_TOP.id,
    entityTypeId: GAS_LANTERN_TYPE,
    hostProperty: GAS_LANTERN_HOST_PROPERTY,
    footprint: GAS_LANTERN_ON_TOP.footprint,
  });
}
