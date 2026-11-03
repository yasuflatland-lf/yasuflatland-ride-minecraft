// Lays every loaded tent's cells each tick, sends its flaps' swing, and clears
// those of tents taken down (ADR 0096, 0131, 0132, 0134).
import { EntityInitializationCause, system, world } from "@minecraft/server";
import type { FoldLegacyTents } from "../../../../application/camp/foldLegacyTents";
import { TENT_LAYOUT_VERSION, TENT_SPEC } from "../../../../domain/camp/spec";
import {
  type TentBlock,
  type TentId,
  tentCells,
} from "../../../../domain/camp/tent";
import type { CellLayer } from "../../../shared/laidCells";
import { TENT_FLAP_PROPERTY, TENT_TYPE } from "../../identifiers";
import type { DynamicPropertyTentRegistry } from "../../persistence/tentRegistry";
import { isLanternOn, tentEntityOf } from "../tentEntity";
import type { TentFlapStore } from "../tentFlapStore";

export function registerTentLoop(
  registry: DynamicPropertyTentRegistry,
  blocks: CellLayer<TentId, TentBlock>,
  flaps: TentFlapStore,
  foldLegacy: FoldLegacyTents,
): void {
  let initialized = false;
  let pendingLegacy = 0;
  let recheckIn = 0;
  const fold = () => {
    try {
      pendingLegacy = foldLegacy.execute();
    } catch {
      // Even a registry read failure must leave the laying and flap loop running.
      pendingLegacy = Math.max(1, pendingLegacy);
    }
    recheckIn = TENT_SPEC.cellRecheckTicks;
  };
  const foldLoaded = (typeId: string) => {
    if (initialized && pendingLegacy > 0 && typeId === TENT_TYPE) fold();
  };
  world.afterEvents.entityLoad.subscribe((ev) => foldLoaded(ev.entity.typeId));
  world.afterEvents.entitySpawn.subscribe((ev) => {
    if (ev.cause === EntityInitializationCause.Loaded)
      foldLoaded(ev.entity.typeId);
  });
  system.runInterval(() => {
    if (!initialized) {
      // The registry is lazy: the first tick is outside early execution, before any lay.
      initialized = true;
      fold();
    } else if (pendingLegacy > 0 && --recheckIn <= 0) {
      fold();
    }
    const entries = registry.all();
    for (const entry of entries) {
      if (entry.layout < TENT_LAYOUT_VERSION) continue;
      const entity = tentEntityOf(entry.id);
      if (!entity) continue;
      const tentFlaps = flaps.flapsOf(entity);
      for (const s of tentFlaps.swing()) {
        try {
          entity.setProperty(TENT_FLAP_PROPERTY[s.flap], s.open);
        } catch {
          // A property write failed; resend every flap on the next tick (ADR 0127).
          tentFlaps.resync();
          break;
        }
      }
      // The blocks follow the target, so an opening is passable from the next
      // lay; a restored tent lays its lantern as it was on its first tick.
      blocks.lay(
        entry.id,
        entity,
        tentCells(entry.pose, {
          openFlaps: tentFlaps.open(),
          lanternOn: isLanternOn(entity),
        }),
      );
    }
    // The live set is the registry, not the loaded entities: a tent whose
    // entity's chunk unloads keeps its cells in a neighbor chunk that stays loaded.
    const live = new Set(entries.map((e) => e.id));
    blocks.clearGone(live);
    flaps.forgetGone(live);
  }, 1);
}
