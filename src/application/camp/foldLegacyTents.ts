import { TENT_LAYOUT_VERSION } from "../../domain/camp/spec";
import { legacyTents } from "../../domain/camp/tentRegistry";
import type { LegacyTentWorld } from "./ports/legacyTent";

export class FoldLegacyTents {
  constructor(
    private readonly world: LegacyTentWorld,
    private readonly current: number = TENT_LAYOUT_VERSION,
  ) {}

  execute(): number {
    let deferred = 0;
    for (const entry of legacyTents(this.world.listTents(), this.current)) {
      try {
        if (this.world.foldInto(entry) === "deferred") deferred++;
      } catch {
        // A failed tent must not prevent other loaded tents from folding.
        deferred++;
      }
    }
    return deferred;
  }
}
