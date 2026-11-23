import { canTakeBack } from "../../domain/resort/beachChair";
import type { BeachChairId } from "../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../domain/resort/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { BeachChairTakeBackWorld } from "./ports/beachChairWorld";

export class TakeBackBeachChair {
  private readonly takeBack = new TakeBackByHits<
    BeachChairId,
    PlayerId,
    "missing" | "occupied" | "somethingOnTop"
  >({
    rule: BEACH_CHAIR_SPEC.recovery,
    refusal: (id) => {
      const state = this.world.state(id);
      if (!state) return "missing";
      const allowed = canTakeBack(state);
      return allowed.ok ? undefined : allowed.reason;
    },
    showRefusal: (player, reason) => {
      if (reason !== "missing") this.world.showRefused(player, reason);
    },
    giveBack: (id, player) => this.world.dropItem(id, player),
    remove: (id) => this.world.remove(id),
    feedback: {
      remaining: (_id, player, left) => this.world.showHitsLeft(player, left),
      taken: (_id, player) => this.world.showTaken(player),
    },
    order: ["giveBack", "remove"],
  });

  constructor(private readonly world: BeachChairTakeBackWorld) {}

  execute(cmd: { id: BeachChairId; player: PlayerId; tick: number }): void {
    this.takeBack.hit(cmd.id, cmd.tick, cmd.player);
  }
}
