import { type Entity, world } from "@minecraft/server";
import type { TentId } from "../../../domain/camp/tent";
import { TENT_LANTERN_PROPERTY, TENT_TYPE } from "../identifiers";

/** The tent's entity while it is loaded and still a tent. */
export function tentEntityOf(tentId: TentId): Entity | undefined {
  const entity = world.getEntity(tentId);
  return entity?.isValid && entity.typeId === TENT_TYPE ? entity : undefined;
}

// The entity property is the lantern's only saved state: it lives through
// /reload and a restart with the entity, and the tent loop lays the cell from it.
export function isLanternOn(tent: Entity): boolean {
  return tent.getProperty(TENT_LANTERN_PROPERTY) === true;
}
