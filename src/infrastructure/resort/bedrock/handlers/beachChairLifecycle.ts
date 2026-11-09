import { system, world } from "@minecraft/server";
import {
  asBeachChairId,
  type BeachChairId,
} from "../../../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../../domain/resort/spec";
import { registerLaidBlockGuard } from "../../../shared/laidBlockGuard";
import { BEACH_CHAIR } from "../../identifiers";
import type { BedrockBeachChairWorld } from "../bedrockBeachChairWorld";

export function registerBeachChairLifecycle(
  adapter: BedrockBeachChairWorld,
): void {
  const removed = new Set<BeachChairId>();
  world.afterEvents.entityLoad.subscribe(({ entity }) => {
    if (entity.typeId === BEACH_CHAIR) adapter.remember(entity);
  });
  world.beforeEvents.entityRemove.subscribe(({ removedEntity: entity }) => {
    if (entity.typeId !== BEACH_CHAIR) return;
    adapter.remember(entity);
    const id = asBeachChairId(entity.id);
    const dimension = entity.dimension;
    const location = { ...entity.location };
    system.run(() => {
      if (adapter.entity(id)) return;
      try {
        if (dimension.getBlock(location) === undefined) return;
      } catch {
        return;
      }
      if (!adapter.clearTop(id)) removed.add(id);
    });
  });
  system.runInterval(() => {
    const loaded: BeachChairId[] = [];
    for (const name of ["overworld", "nether", "the_end"]) {
      for (const entity of world
        .getDimension(name)
        .getEntities({ type: BEACH_CHAIR }))
        loaded.push(asBeachChairId(entity.id));
    }
    for (const id of loaded) adapter.syncTop(id);
    for (const id of removed) if (adapter.clearTop(id)) removed.delete(id);
  }, BEACH_CHAIR_SPEC.topSyncTicks);
  registerLaidBlockGuard((dimension, cell, typeId) =>
    adapter.topOwner(dimension, cell, typeId),
  );
}
