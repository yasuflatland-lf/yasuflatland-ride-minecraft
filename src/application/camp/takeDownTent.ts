// Use case: a hit on a tent from outside; the third in a row while nobody is inside takes it down into its item (ADR 0131).
import { TENT_SPEC } from "../../domain/camp/spec";
import type { TentId } from "../../domain/camp/tent";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import { handleHit } from "../shared/takeBackByHits";
import type { TentWorld } from "./ports/tent";

interface TakeDownTentCommand {
  tentId: TentId;
  tick: number;
  /** The player who hit, who is told how many hits are left; none for a test event. */
  playerId?: PlayerId;
}

export class TakeDownTent {
  private readonly hits = new HitCounters<TentId>(TENT_SPEC.recovery);

  constructor(private readonly world: TentWorld) {}

  /** Returns whether the tent was taken down. */
  execute(cmd: TakeDownTentCommand): boolean {
    if (this.world.isOccupied(cmd.tentId)) {
      if (cmd.playerId !== undefined) this.world.showOccupied(cmd.playerId);
      return false;
    }
    let takenDown = false;
    handleHit(this.hits, cmd.tentId, cmd.tick, {
      // Before takeDown: without a player the item drops where the tent is.
      drop: () => this.world.returnTentItem(cmd.tentId, cmd.playerId),
      remove: () => {
        this.world.takeDown(cmd.tentId);
        takenDown = true;
      },
      showRemaining: (left) => {
        if (cmd.playerId !== undefined)
          this.world.showHitsLeft(cmd.playerId, left);
      },
    });
    return takenDown;
  }
}
