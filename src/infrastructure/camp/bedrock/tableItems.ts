import { world } from "@minecraft/server";
import type { TopHostWorld } from "../../../application/shared/placeOnTop";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
  TABLE_SPOTS,
} from "../../../domain/camp/spec";
import { decodeHost } from "../../../domain/shared/hosted";
import { asDimensionId } from "../../../domain/shared/ids";
import type { TopItem, TopRect } from "../../../domain/shared/tableTop";
import {
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_TYPE,
  GAS_LANTERN_HOST_PROPERTY,
  GAS_LANTERN_TYPE,
} from "../identifiers";

/** Every entity type that can stand on a table, with where it keeps its host marker. */
const HOSTED_KINDS: readonly {
  readonly type: string;
  readonly hostProperty: string;
  readonly footprint: TopRect;
}[] = [
  {
    type: DUTCH_OVEN_TYPE,
    hostProperty: DUTCH_OVEN_HOST_PROPERTY,
    footprint: DUTCH_OVEN_FOOTPRINT_PX,
  },
  {
    type: GAS_LANTERN_TYPE,
    hostProperty: GAS_LANTERN_HOST_PROPERTY,
    footprint: GAS_LANTERN_FOOTPRINT_PX,
  },
];

/** The table's place in the world, for any kind of item put on its top. */
export function tableTop(id: string): ReturnType<TopHostWorld["topHost"]> {
  const table = world.getEntity(id);
  return table?.isValid && table.typeId === CAMP_TABLE_TYPE
    ? {
        dimension: asDimensionId(table.dimension.id),
        at: table.location,
        yaw: table.getRotation().y,
      }
    : undefined;
}

/** Scans the table's dimension, so no stored list can drift from the world (ADR 0185). */
export function itemsOnTable(id: string): TopItem[] {
  const table = world.getEntity(id);
  if (!table?.isValid) return [];
  return HOSTED_KINDS.flatMap(({ type, hostProperty, footprint }) =>
    table.dimension.getEntities({ type }).flatMap((entity) => {
      const value = entity.getDynamicProperty(hostProperty);
      const host = decodeHost(
        typeof value === "string" ? value : "",
        (type, spot) => (type === "camp_table" ? TABLE_SPOTS[spot] : undefined),
      );
      return host.kind === "top" &&
        host.hostType === "camp_table" &&
        host.id === id
        ? [{ at: host.at, footprint }]
        : [];
    }),
  );
}
