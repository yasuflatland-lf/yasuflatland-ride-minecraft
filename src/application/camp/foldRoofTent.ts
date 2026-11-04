import type { RoofTentId } from "../../domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import type { RoofTentWorld } from "./ports/roofTent";

export class FoldRoofTent {
  private readonly hits = new HitCounters<RoofTentId>({
    hits: ROOF_TENT_SPEC.hitsToFoldUp,
    resetTicks: ROOF_TENT_SPEC.hitResetTicks,
  });
  constructor(private readonly world: RoofTentWorld) {}

  execute(cmd: {
    tentId: RoofTentId;
    tick: number;
    playerId?: PlayerId;
  }): boolean {
    this.hits.forgetStale(cmd.tick);
    const result = this.hits.hit(cmd.tentId, cmd.tick, false);
    if (result.broken) {
      this.world.returnItem(cmd.tentId, cmd.playerId);
      this.world.remove(cmd.tentId);
      return true;
    }
    if (cmd.playerId !== undefined)
      this.world.showMessage(cmd.playerId, `hits_left:${result.hitsLeft}`);
    return false;
  }
}
