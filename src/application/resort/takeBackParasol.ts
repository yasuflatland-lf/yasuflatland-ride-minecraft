import type { ParasolId } from "../../domain/resort/ids";
import { PARASOL_SPEC } from "../../domain/resort/spec";
import { HitCounters } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";
import { handleHit } from "../shared/takeBackByHits";
import type { ParasolTakeBackWorld } from "./ports/parasolWorld";

export class TakeBackParasol {
  private readonly hits = new HitCounters<ParasolId>({
    hits: PARASOL_SPEC.hitsToTakeBack,
    resetTicks: PARASOL_SPEC.hitResetTicks,
  });
  constructor(private readonly world: ParasolTakeBackWorld) {}
  execute(cmd: { id: ParasolId; player: PlayerId; tick: number }): void {
    handleHit(this.hits, cmd.id, cmd.tick, {
      drop: () => {
        this.world.clearCeiling(cmd.id);
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
