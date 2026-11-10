import { type Dimension, system, world } from "@minecraft/server";
import {
  FURNITURE_SPEC,
  FURNITURE_TOP_SYNC_TICKS,
} from "../../../../domain/resort/furniture";
import { asFurnitureId, type FurnitureId } from "../../../../domain/resort/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { safeBlockAt } from "../../../shared/blocks";
import { registerLaidBlockGuard } from "../../../shared/laidBlockGuard";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  furnitureKindOf,
} from "../../identifiers";
import type { BedrockFurnitureWorld } from "../bedrockFurnitureWorld";

export function registerFurnitureTopLifecycle(
  adapter: BedrockFurnitureWorld,
): void {
  const removed = new Map<
    FurnitureId,
    { dimension: Dimension; location: Vec3 }
  >();
  const hasTop = (typeId: string) => {
    const kind = furnitureKindOf(typeId, "entity");
    return kind !== undefined && FURNITURE_SPEC[kind].top !== undefined;
  };
  const clearRemoved = () => {
    for (const [id, record] of removed) {
      if (adapter.entity(id)) {
        removed.delete(id);
        continue;
      }
      // entityRemove also fires on unload; wait until the origin can be inspected.
      if (!safeBlockAt(record.dimension, record.location)) continue;
      if (adapter.clearTop(id)) removed.delete(id);
    }
  };
  world.afterEvents.entityLoad.subscribe(({ entity }) => {
    if (hasTop(entity.typeId)) adapter.remember(entity);
  });
  world.beforeEvents.entityRemove.subscribe(({ removedEntity: entity }) => {
    if (!hasTop(entity.typeId)) return;
    adapter.remember(entity);
    removed.set(asFurnitureId(entity.id), {
      dimension: entity.dimension,
      location: { ...entity.location },
    });
    system.run(clearRemoved);
  });
  system.runInterval(() => {
    for (const name of ["overworld", "nether", "the_end"]) {
      const dimension = world.getDimension(name);
      for (const { entity: type } of Object.values(FURNITURE_IDS)) {
        if (!hasTop(type)) continue;
        for (const entity of dimension.getEntities({ type }))
          adapter.layTop(asFurnitureId(entity.id));
      }
    }
    clearRemoved();
  }, FURNITURE_TOP_SYNC_TICKS);
  registerLaidBlockGuard((dimension, cell, typeId) =>
    typeId === DINING_TABLE_TOP ? adapter.ownerAt(dimension, cell) : undefined,
  );
}
