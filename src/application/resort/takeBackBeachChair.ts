import { canTakeBack } from "../../domain/resort/beachChair";
import type { BeachChairId } from "../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import { handleHit } from "../shared/takeBackByHits";
import type { BeachChairTakeBackWorld } from "./ports/beachChairWorld";

export class TakeBackBeachChair {
  private readonly hits = new HitCounters<BeachChairId>({
    hits: BEACH_CHAIR_SPEC.hitsToTakeBack,
    resetTicks: BEACH_CHAIR_SPEC.hitResetTicks,
  });
  constructor(private readonly world: BeachChairTakeBackWorld) {}
  execute(cmd: { id: BeachChairId; player: PlayerId; tick: number }): void {
    const state = this.world.state(cmd.id);
    if (!state) return;
    const allowed = canTakeBack(state);
    if (!allowed.ok) {
      this.world.showRefused(cmd.player, allowed.reason);
      return;
    }
    handleHit(this.hits, cmd.id, cmd.tick, {
      drop: () => {
        this.world.dropItem(cmd.id, cmd.player);
      },
      remove: () => {
        this.world.remove(cmd.id);
        this.world.showTaken(cmd.player);
      },
      showRemaining: (left) => this.world.showRemaining(cmd.player, left),
    });
  }
}
