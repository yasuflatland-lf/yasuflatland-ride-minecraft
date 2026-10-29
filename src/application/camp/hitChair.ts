// Use case: a hit on a chair; the third in a row while nobody sits folds it back into its item (ADR 0122).
import type { ChairId, ChairKindId } from "../../domain/camp/chair";
import { CHAIR_SPEC } from "../../domain/camp/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import type { ChairWorld } from "./ports/chair";

export interface HitChairCommand {
  kind: ChairKindId;
  chairId: ChairId;
  tick: number;
  /** The player who hit, who is told how many hits are left; none for a test event. */
  playerId?: PlayerId;
}

const RULE = {
  hits: CHAIR_SPEC.hitsToTakeBack,
  resetTicks: CHAIR_SPEC.hitResetTicks,
};

export class HitChair {
  private readonly hits = new HitCounters<ChairId>(RULE);

  constructor(private readonly world: ChairWorld) {}

  /** Returns whether the chair was taken back. */
  execute(cmd: HitChairCommand): boolean {
    this.hits.forgetStale(cmd.tick);
    if (this.world.kindOf(cmd.chairId) !== cmd.kind) return false;
    const occupied = this.world.isOccupied(cmd.chairId);
    const r = this.hits.hit(cmd.chairId, cmd.tick, occupied);
    if (r.broken) {
      this.world.dropChairItem(cmd.chairId);
      this.world.removeChair(cmd.chairId);
      return true;
    }
    if (occupied) return false;
    if (cmd.playerId !== undefined)
      this.world.showHitsLeft(cmd.kind, cmd.playerId, r.hitsLeft);
    return false;
  }
}
