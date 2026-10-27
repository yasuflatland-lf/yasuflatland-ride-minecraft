import { world } from "@minecraft/server";
import { decodeHost } from "../../../domain/camp/dutchOven";
import { DUTCH_OVEN_HOST_PROPERTY, DUTCH_OVEN_TYPE } from "../identifiers";

export function takenTableSpots(id: string): ReadonlySet<number> {
  const table = world.getEntity(id);
  const taken = new Set<number>();
  if (!table?.isValid) return taken;
  for (const oven of table.dimension.getEntities({ type: DUTCH_OVEN_TYPE })) {
    const value = oven.getDynamicProperty(DUTCH_OVEN_HOST_PROPERTY);
    const host = decodeHost(typeof value === "string" ? value : "");
    if (host.kind === "camp_table" && host.id === id) taken.add(host.spot);
  }
  return taken;
}
