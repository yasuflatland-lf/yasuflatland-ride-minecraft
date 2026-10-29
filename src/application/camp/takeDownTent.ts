// Use case: a hit on a tent from outside; the third in a row while nobody is inside takes it down into its item (ADR 0131).
import { TENT_SPEC } from "../../domain/camp/spec";
import type { TentId } from "../../domain/camp/tent";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import type { TentWorld } from "./ports/tent";

export interface TakeDownTentCommand {
  tentId: TentId;
  tick: number;
  /** The player who hit, who is told how many hits are left; none for a test event. */
  playerId?: PlayerId;
}

const RULE = {
  hits: TENT_SPEC.hitsToTakeDown,
  resetTicks: TENT_SPEC.hitResetTicks,
};

export class TakeDownTent {
  private readonly hits = new HitCounters<TentId>(RULE);

  constructor(private readonly world: TentWorld) {}

  /** Returns whether the tent was taken down. */
  execute(cmd: TakeDownTentCommand): boolean {
    this.hits.forgetStale(cmd.tick);
    const occupied = this.world.isOccupied(cmd.tentId);
    const r = this.hits.hit(cmd.tentId, cmd.tick, occupied);
    if (r.broken) {
      // Before takeDown: without a player the item drops where the tent is.
      this.world.returnTentItem(cmd.tentId, cmd.playerId);
      this.world.takeDown(cmd.tentId);
      return true;
    }
    if (occupied) {
      if (cmd.playerId !== undefined) this.world.showOccupied(cmd.playerId);
      return false;
    }
    if (cmd.playerId !== undefined)
      this.world.showHitsLeft(cmd.playerId, r.hitsLeft);
    return false;
  }
}
