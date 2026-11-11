import { system, world } from "@minecraft/server";
import type { SyncParasolCeilings } from "../../../../application/resort/syncParasolCeilings";
import { asParasolId, type ParasolId } from "../../../../domain/resort/ids";
import { PARASOL_SPEC } from "../../../../domain/resort/spec";
import { allDimensions } from "../../../shared/dimensions";
import { registerLaidBlockGuard } from "../../../shared/laidBlockGuard";
import { BEACH_PARASOL } from "../../identifiers";
import type { BedrockParasolWorld } from "../bedrockParasolWorld";

export function registerParasolLifecycle(
  adapter: BedrockParasolWorld,
  sync: SyncParasolCeilings,
): void {
  const removed = new Set<ParasolId>();
  world.afterEvents.entityLoad.subscribe(({ entity }) => {
    if (entity.typeId === BEACH_PARASOL) adapter.remember(entity);
  });
  world.beforeEvents.entityRemove.subscribe(({ removedEntity: entity }) => {
    if (entity.typeId !== BEACH_PARASOL) return;
    adapter.remember(entity);
    const id = asParasolId(entity.id);
    const dimension = entity.dimension;
    const location = { ...entity.location };
    system.run(() => {
      if (adapter.entity(id)) return;
      try {
        if (dimension.getBlock(location) === undefined) return;
      } catch {
        return;
      }
      if (!adapter.clearCeiling(id)) removed.add(id);
    });
  });
  system.runInterval(() => {
    const loaded: ParasolId[] = [];
    for (const dimension of allDimensions()) {
      for (const entity of dimension.getEntities({ type: BEACH_PARASOL }))
        loaded.push(asParasolId(entity.id));
    }
    sync.execute(loaded);
    for (const id of removed) if (adapter.clearCeiling(id)) removed.delete(id);
  }, PARASOL_SPEC.ceilingSyncTicks);
  registerLaidBlockGuard((dimension, cell, typeId) =>
    adapter.ceilingOwner(dimension, cell, typeId),
  );
}
