// Lays every loaded tent's cells each tick and clears those of tents taken down (ADR 0096, 0131).
import { system, world } from "@minecraft/server";
import {
  type TentBlock,
  type TentId,
  tentCells,
} from "../../../../domain/camp/tent";
import type { CellLayer } from "../../../shared/laidCells";
import { TENT_TYPE } from "../../identifiers";
import type { DynamicPropertyTentRegistry } from "../../persistence/tentRegistry";

export function registerTentLoop(
  registry: DynamicPropertyTentRegistry,
  blocks: CellLayer<TentId, TentBlock>,
): void {
  system.runInterval(() => {
    const entries = registry.all();
    for (const entry of entries) {
      const entity = world.getEntity(entry.id);
      if (entity?.isValid && entity.typeId === TENT_TYPE)
        blocks.lay(entry.id, entity, tentCells(entry.pose));
    }
    // The live set is the registry, not the loaded entities: a tent whose
    // entity's chunk unloads keeps its cells in a neighbor chunk that stays loaded.
    blocks.clearGone(new Set(entries.map((e) => e.id)));
  }, 1);
}
