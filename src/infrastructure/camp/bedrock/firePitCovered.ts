import { world } from "@minecraft/server";
import type { FirePitId } from "../../../domain/camp/firePit";
import { FIRE_PIT_COVERED_PROPERTY, FIRE_PIT_TYPE } from "../identifiers";

export function firePitEntity(id: FirePitId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === FIRE_PIT_TYPE
    ? entity
    : undefined;
}

export function isFirePitCovered(id: FirePitId): boolean {
  return firePitEntity(id)?.getProperty(FIRE_PIT_COVERED_PROPERTY) === true;
}

export function setFirePitCovered(id: FirePitId, covered: boolean): void {
  firePitEntity(id)?.setProperty(FIRE_PIT_COVERED_PROPERTY, covered);
}
