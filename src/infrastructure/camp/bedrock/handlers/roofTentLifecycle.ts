import { system, world } from "@minecraft/server";
import type { RoofTentHostGuard } from "../../../../application/camp/roofTentHostGuard";
import { asRoofTentId } from "../../../../domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../../../domain/camp/spec";
import { ROOF_TENT_TYPE } from "../../identifiers";
import type { BedrockRoofTentOccupantWorld } from "../bedrockRoofTentOccupantWorld";
import { roofTentEntity } from "../bedrockRoofTentWorld";
import type { RoofTentHosts } from "../roofTentHosts";

export function registerRoofTentLifecycle(
  occupants: BedrockRoofTentOccupantWorld,
  guard: RoofTentHostGuard,
  hosts: RoofTentHosts,
): void {
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
    if (!isTent && hosts.lookup(entity.id).status !== "present") return;
    if (isTent) occupants.remember(entity);
    const id = entity.id;
    const dimension = entity.dimension;
    const location = { ...entity.location };
    system.run(() => {
      if (isTent && roofTentEntity(asRoofTentId(id))) return;
      try {
        if (dimension.getBlock(location) === undefined) {
          if (isTent) occupants.forget(asRoofTentId(id));
          return;
        }
      } catch {
        if (isTent) occupants.forget(asRoofTentId(id));
        return;
      }
      if (isTent) {
        occupants.eject(asRoofTentId(id));
        occupants.removed(asRoofTentId(id), undefined);
      } else {
        hosts.removed(id);
        guard.check();
      }
    });
  });
  system.runInterval(() => guard.check(), ROOF_TENT_SPEC.hostCheckTicks);
}
