import {
  legacyTentClearCells,
  legacyTentExit,
} from "../../domain/camp/legacyTent";
import { TENT_LAYOUT_VERSION } from "../../domain/camp/spec";
import { legacyTents } from "../../domain/camp/tentRegistry";
import type { LegacyTentWorld } from "./ports/legacyTent";
import { removeTent } from "./removeTent";

export class FoldLegacyTents {
  constructor(
    private readonly world: LegacyTentWorld,
    private readonly current: number = TENT_LAYOUT_VERSION,
  ) {}

  execute(): number {
    let deferred = 0;
    for (const entry of legacyTents(this.world.listTents(), this.current)) {
      try {
        if (!this.world.anchorLoaded(entry)) {
          deferred++;
          continue;
        }
        this.world.ejectPlayers(
          entry.dimensionId,
          legacyTentClearCells(entry.pose),
          legacyTentExit(entry.pose),
        );
        // The playerless refund needs the entity or registry location.
        this.world.returnTentItem(entry.id, undefined);
        removeTent(this.world, entry.id, entry);
      } catch {
        // A failed tent must not prevent other loaded tents from folding.
        deferred++;
      }
    }
    return deferred;
  }
}
