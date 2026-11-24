import type { ParasolId } from "../../domain/resort/ids";
import { PARASOL_SPEC } from "../../domain/resort/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { ParasolTakeBackWorld } from "./ports/parasolWorld";

export class TakeBackParasol {
  private readonly takeBack = new TakeBackByHits<ParasolId, PlayerId>({
    rule: PARASOL_SPEC.recovery,
    release: (id) => this.world.clearCeiling(id),
    giveBack: (id, player) => this.world.dropItem(id, player),
    remove: (id) => this.world.remove(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
      taken: (_id, player) => this.world.showTaken(player),
    },
    order: ["release", "giveBack", "remove"],
  });

  constructor(private readonly world: ParasolTakeBackWorld) {}

  execute(cmd: { id: ParasolId; player: PlayerId; tick: number }): void {
    this.takeBack.hit(cmd.id, cmd.tick, cmd.player);
  }
}
