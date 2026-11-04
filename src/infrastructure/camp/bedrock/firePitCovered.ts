import { world } from "@minecraft/server";
import type { FirePitId } from "../../../domain/camp/firePit";
import { entityOfType } from "../../shared/entities";
import { FIRE_PIT_COVERED_PROPERTY, FIRE_PIT_TYPE } from "../identifiers";

export function firePitEntity(id: FirePitId) {
  return entityOfType(world, id, FIRE_PIT_TYPE);
}

export function isFirePitCovered(id: FirePitId): boolean {
  return firePitEntity(id)?.getProperty(FIRE_PIT_COVERED_PROPERTY) === true;
}

export function setFirePitCovered(id: FirePitId, covered: boolean): void {
  firePitEntity(id)?.setProperty(FIRE_PIT_COVERED_PROPERTY, covered);
}
