// Use case: a hit on a chair; the third in a row while nobody sits folds it back into its item (ADR 0122).
import type { ChairId, ChairKindId } from "../../domain/camp/chair";
import { CHAIR_SPEC } from "../../domain/camp/spec";
import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../../domain/shared/hitCounter";
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
  private readonly counters = new Map<ChairId, HitCounter>();

  constructor(private readonly world: ChairWorld) {}

  /** Returns whether the chair was taken back. */
  execute(cmd: HitChairCommand): boolean {
    this.forgetStale(cmd.tick);
    if (this.world.kindOf(cmd.chairId) !== cmd.kind) return false;
    const occupied = this.world.isOccupied(cmd.chairId);
    const r = registerHit(
      this.counters.get(cmd.chairId) ?? EMPTY_COUNTER,
      cmd.tick,
      occupied,
      RULE,
    );
    if (r.broken) {
      this.counters.delete(cmd.chairId);
      this.world.dropChairItem(cmd.chairId);
      this.world.removeChair(cmd.chairId);
      return true;
    }
    if (occupied) return false;
    this.counters.set(cmd.chairId, r.counter);
    if (cmd.playerId !== undefined)
      this.world.showHitsLeft(
        cmd.kind,
        cmd.playerId,
        RULE.hits - r.counter.count,
      );
    return false;
  }

  // A counter past its reset window counts as empty, so dropping it changes
  // nothing but keeps chairs hit once from piling up.
  private forgetStale(tick: number): void {
    for (const [id, counter] of this.counters) {
      if (tick - counter.lastTick > RULE.resetTicks) this.counters.delete(id);
    }
  }
}
