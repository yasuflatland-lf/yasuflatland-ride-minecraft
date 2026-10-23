// Forgets a killed tent, and removes a tent entity the registry does not know with its cells (ADR 0125, 0131).
import {
  type Dimension,
  type Entity,
  EntityInitializationCause,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import {
  asTentId,
  type TentBlock,
  type TentId,
} from "../../../../domain/camp/tent";
import type { CellLayer } from "../../../shared/laidCells";
import { TENT_TYPE } from "../../identifiers";
import type { DynamicPropertyTentRegistry } from "../../persistence/tentRegistry";

export function registerTentLifecycle(
  registry: DynamicPropertyTentRegistry,
  blocks: CellLayer<TentId, TentBlock>,
): void {
  world.beforeEvents.entityRemove.subscribe((ev) => {
    const tent = ev.removedEntity;
    if (tent.typeId !== TENT_TYPE) return;
    const id = asTentId(tent.id);
    const dimension = tent.dimension;
    const location = { ...tent.location };
    // Before events are read-only. A removal in a loaded chunk is a kill or a
    // take-down, not an unload (ADR 0125).
    system.run(() => {
      if (chunkLoadedAt(dimension, location)) registry.remove(id);
    });
  });
  const removeOrphan = (entity: Entity) => {
    if (
      entity.isValid &&
      entity.typeId === TENT_TYPE &&
      !registry.all().some((e) => e.id === entity.id)
    ) {
      // A tent taken down before its entity loaded may still have cells laid
      // in the world. Clearing from its saved cells keeps a layer entry for the
      // ones still unloaded, which clearGone clears later (it is not live).
      blocks.lay(asTentId(entity.id), entity, []);
      entity.remove();
    }
  };
  world.afterEvents.entityLoad.subscribe((ev) => removeOrphan(ev.entity));
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause === EntityInitializationCause.Loaded) removeOrphan(ev.entity);
  });
}

// getBlock returns undefined in an unloaded chunk but can also throw
// LocationInUnloadedChunkError; both mean the chunk unloaded (ADR 0125).
function chunkLoadedAt(dimension: Dimension, location: Vector3): boolean {
  try {
    return dimension.getBlock(location) !== undefined;
  } catch {
    return false;
  }
}
