// Use case: a hit on a chair; the third in a row while nobody sits folds it back into its item (ADR 0122).
import type { ChairId, ChairKindId } from "../../domain/camp/chair";
import { CHAIR_SPEC } from "../../domain/camp/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { TakeBackByHits } from "../shared/takeBackByHits";
import type { ChairWorld } from "./ports/chair";

interface HitChairCommand {
  kind: ChairKindId;
  chairId: ChairId;
  tick: number;
  /** The player who hit, who is told how many hits are left; none for a test event. */
  playerId?: PlayerId;
}

export class HitChair {
  private readonly takeBack = new TakeBackByHits<
    Pick<HitChairCommand, "kind" | "chairId">
  >({
    rule: CHAIR_SPEC.recovery,
    key: ({ chairId }) => chairId,
    refusal: ({ chairId, kind }) => {
      if (this.world.kindOf(chairId) !== kind) return "wrongKind";
      return this.world.isOccupied(chairId) ? "occupied" : undefined;
    },
    giveBack: ({ chairId }, player) =>
      this.world.dropChairItem(chairId, player),
    remove: ({ chairId }) => this.world.removeChair(chairId),
    feedback: {
      remaining: ({ kind }, player, left) =>
        this.world.showHitsLeft(kind, player, left),
    },
    order: ["giveBack", "remove"],
  });

  constructor(private readonly world: ChairWorld) {}

  /** Returns whether the chair was taken back. */
  execute(cmd: HitChairCommand): boolean {
    return this.takeBack.hit(cmd, cmd.tick, cmd.playerId) === "taken";
  }
}
