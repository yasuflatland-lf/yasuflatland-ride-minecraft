// Use case: a hit on a tent from outside; the third in a row while nobody is inside takes it down into its item (ADR 0131).
import { TENT_SPEC } from "../../domain/camp/spec";
import type { TentId } from "../../domain/camp/tent";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { TentWorld } from "./ports/tent";
import { releaseTentBlocks } from "./removeTent";

interface TakeDownTentCommand {
  tentId: TentId;
  tick: number;
  /** The player who hit, who is told how many hits are left; none for a test event. */
  playerId?: PlayerId;
}

export class TakeDownTent {
  private readonly takeBack = new TakeBackByHits<TentId>({
    rule: TENT_SPEC.recovery,
    refusal: (id) => (this.world.isOccupied(id) ? "occupied" : undefined),
    showRefusal: (player) => this.world.showOccupied(player),
    release: (id) => releaseTentBlocks(this.world, id),
    // The playerless refund needs the entity or registry location.
    giveBack: (id, player) => this.world.returnTentItem(id, player),
    remove: (id) => this.world.removeTent(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
    },
    order: ["giveBack", "release", "remove"],
  });

  constructor(private readonly world: TentWorld) {}

  /** Returns whether the tent was taken down. */
  execute(cmd: TakeDownTentCommand): boolean {
    return this.takeBack.hit(cmd.tentId, cmd.tick, cmd.playerId) === "taken";
  }
}
