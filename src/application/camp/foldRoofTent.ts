import type { RoofTentId } from "../../domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../domain/camp/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { RoofTentWorld } from "./ports/roofTent";

export class FoldRoofTent {
  private readonly takeBack = new TakeBackByHits<RoofTentId>({
    rule: ROOF_TENT_SPEC.recovery,
    giveBack: (id, player) => this.world.returnItem(id, player),
    remove: (id) => this.world.remove(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
    },
    order: ["giveBack", "remove"],
  });

  constructor(private readonly world: RoofTentWorld) {}

  execute(cmd: {
    tentId: RoofTentId;
    tick: number;
    playerId?: PlayerId;
  }): boolean {
    return this.takeBack.hit(cmd.tentId, cmd.tick, cmd.playerId) === "taken";
  }
}
