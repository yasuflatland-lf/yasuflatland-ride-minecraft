import { world } from "@minecraft/server";
import { decodeHost } from "../../../domain/camp/hosted";
import { DUTCH_OVEN_FOOTPRINT_PX } from "../../../domain/camp/spec";
import type { Footprint, TopItem } from "../../../domain/camp/tabletop";
import { DUTCH_OVEN_HOST_PROPERTY, DUTCH_OVEN_TYPE } from "../identifiers";

/** Every entity type that can stand on a table, with where it keeps its host marker. */
const HOSTED_KINDS: readonly {
  readonly type: string;
  readonly hostProperty: string;
  readonly footprint: Footprint;
}[] = [
  {
    type: DUTCH_OVEN_TYPE,
    hostProperty: DUTCH_OVEN_HOST_PROPERTY,
    footprint: DUTCH_OVEN_FOOTPRINT_PX,
  },
];

/** Scans the table's dimension, so no stored list can drift from the world (ADR 0185). */
export function itemsOnTable(id: string): TopItem[] {
  const table = world.getEntity(id);
  if (!table?.isValid) return [];
  return HOSTED_KINDS.flatMap(({ type, hostProperty, footprint }) =>
    table.dimension.getEntities({ type }).flatMap((entity) => {
      const value = entity.getDynamicProperty(hostProperty);
      const host = decodeHost(typeof value === "string" ? value : "");
      return host.kind === "camp_table" && host.id === id
        ? [{ at: host.at, footprint }]
        : [];
    }),
  );
}
