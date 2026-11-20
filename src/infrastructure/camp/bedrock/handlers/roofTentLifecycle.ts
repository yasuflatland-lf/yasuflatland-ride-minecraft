import { type Entity, system, world } from "@minecraft/server";
import type { RoofTentRemoved } from "../../../../application/camp/ports/roofTent";
import type { RoofTentHostGuard } from "../../../../application/camp/roofTentHostGuard";
import { asRoofTentId, type RoofTentId } from "../../../../domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../../../domain/camp/spec";
import { ROOF_TENT_TYPE } from "../../identifiers";
import { roofTentEntity } from "../bedrockRoofTentWorld";
import type { RoofTentHosts } from "../roofTentHosts";

interface RoofTentLifecycleOccupants {
  remember(entity: Entity): void;
  clearCeiling(id: RoofTentId): void;
  forget(id: RoofTentId): void;
}

export function registerRoofTentLifecycle(
  occupants: RoofTentLifecycleOccupants,
  guard: RoofTentHostGuard,
  hosts: RoofTentHosts,
  cleanup: RoofTentRemoved,
  isRemoving: (id: RoofTentId) => boolean,
): void {
  const forgetUnloaded = (id: RoofTentId) => {
    occupants.clearCeiling(id);
    occupants.forget(id);
  };

  world.afterEvents.entityLoad.subscribe(({ entity }) => {
    hosts.found(entity.id);
    if (entity.typeId === ROOF_TENT_TYPE) occupants.remember(entity);
  });
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    hosts.found(entity.id);
    if (entity.typeId === ROOF_TENT_TYPE) occupants.remember(entity);
  });
  world.beforeEvents.entityRemove.subscribe(({ removedEntity: entity }) => {
    const isTent = entity.typeId === ROOF_TENT_TYPE;
    if (isTent && isRemoving(asRoofTentId(entity.id))) return;
    if (!isTent && hosts.lookup(entity.id).status !== "present") return;
    if (isTent) occupants.remember(entity);
    const id = entity.id;
    const dimension = entity.dimension;
    const location = { ...entity.location };
    system.run(() => {
      if (isTent && roofTentEntity(asRoofTentId(id))) return;
      try {
        if (dimension.getBlock(location) === undefined) {
          if (isTent) forgetUnloaded(asRoofTentId(id));
          return;
        }
      } catch {
        if (isTent) forgetUnloaded(asRoofTentId(id));
        return;
      }
      if (isTent) {
        cleanup.removed(asRoofTentId(id), undefined);
      } else {
        hosts.removed(id);
        guard.check();
      }
    });
  });
  system.runInterval(() => guard.check(), ROOF_TENT_SPEC.hostCheckTicks);
}
