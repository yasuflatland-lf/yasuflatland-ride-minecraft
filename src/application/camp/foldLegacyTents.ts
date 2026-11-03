import {
  isTentBlockTypeId,
  legacyTentClearCells,
} from "../../domain/camp/legacyTent";
import { TENT_LAYOUT_VERSION } from "../../domain/camp/spec";
import { legacyTents } from "../../domain/camp/tentRegistry";
import type { LegacyTentWorld } from "./ports/legacyTent";

export class FoldLegacyTents {
  constructor(
    private readonly world: LegacyTentWorld,
    private readonly current: number = TENT_LAYOUT_VERSION,
  ) {}

  execute(): void {
    for (const entry of legacyTents(this.world.listTents(), this.current)) {
      this.world.ejectOccupants(entry);
      for (const cell of legacyTentClearCells(entry.pose)) {
        if (isTentBlockTypeId(this.world.typeIdAt(entry.dimensionId, cell)))
          this.world.clearTentBlock(entry.dimensionId, cell);
      }
      // The shared no-player refund needs the entity or registry location before removal.
      this.world.returnTentItem(entry.id, undefined);
      this.world.removeLegacyTent(entry);
    }
  }
}
