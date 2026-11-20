import type { RoofTentId } from "../../domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import { handleHit } from "../shared/takeBackByHits";
import type { RoofTentWorld } from "./ports/roofTent";

export class FoldRoofTent {
  private readonly hits = new HitCounters<RoofTentId>(ROOF_TENT_SPEC.recovery);
  constructor(private readonly world: RoofTentWorld) {}

  execute(cmd: {
    tentId: RoofTentId;
    tick: number;
    playerId?: PlayerId;
  }): boolean {
    let folded = false;
    handleHit(this.hits, cmd.tentId, cmd.tick, {
      drop: () => this.world.returnItem(cmd.tentId, cmd.playerId),
      remove: () => {
        this.world.remove(cmd.tentId);
        folded = true;
      },
      showRemaining: (left) => {
        if (cmd.playerId !== undefined)
          this.world.showHitsLeft(cmd.playerId, left);
      },
    });
    return folded;
  }
}
