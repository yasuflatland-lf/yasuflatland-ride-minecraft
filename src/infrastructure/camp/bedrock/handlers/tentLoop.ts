// Lays every loaded tent's cells each tick, sends its flaps' swing, and clears
// those of tents taken down (ADR 0096, 0131, 0132).
import { system, world } from "@minecraft/server";
import {
  type TentBlock,
  type TentId,
  tentCells,
} from "../../../../domain/camp/tent";
import type { CellLayer } from "../../../shared/laidCells";
import { TENT_FLAP_PROPERTY, TENT_TYPE } from "../../identifiers";
import type { DynamicPropertyTentRegistry } from "../../persistence/tentRegistry";
import type { TentFlapStore } from "../tentFlapStore";

export function registerTentLoop(
  registry: DynamicPropertyTentRegistry,
  blocks: CellLayer<TentId, TentBlock>,
  flaps: TentFlapStore,
): void {
  system.runInterval(() => {
    const entries = registry.all();
    for (const entry of entries) {
      const entity = world.getEntity(entry.id);
      if (!entity?.isValid || entity.typeId !== TENT_TYPE) continue;
      const tentFlaps = flaps.flapsOf(entity);
      for (const s of tentFlaps.swing()) {
        try {
          entity.setProperty(TENT_FLAP_PROPERTY[s.flap], s.open);
        } catch {
          // The entity became invalid mid-send; send every flap again (ADR 0127).
          tentFlaps.resync();
          break;
        }
      }
      // The blocks follow the target, so an opening is passable from the next lay.
      blocks.lay(
        entry.id,
        entity,
        tentCells(entry.pose, { openFlaps: tentFlaps.open() }),
      );
    }
    // The live set is the registry, not the loaded entities: a tent whose
    // entity's chunk unloads keeps its cells in a neighbor chunk that stays loaded.
    const live = new Set(entries.map((e) => e.id));
    blocks.clearGone(live);
    flaps.forgetGone(live);
  }, 1);
}
