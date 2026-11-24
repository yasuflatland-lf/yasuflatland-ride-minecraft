import { HitCounters, type HitRule } from "../../domain/shared/hitCounter";
import type { PlayerId } from "../../domain/shared/ids";

type TakeBackOrder<Id> =
  | { order: readonly ["giveBack", "remove"]; release?: never }
  | {
      order:
        | readonly ["giveBack", "release", "remove"]
        | readonly ["release", "giveBack", "remove"]
        | readonly ["release", "remove", "giveBack"];
      release(id: Id): void;
    };

type TakeBackConfig<Id, Player, Reason> = {
  rule: HitRule;
  /** Use a stable key when the target carries per-hit data. */
  key?(id: Id): string;
  refusal?(id: Id): Reason | undefined;
  showRefusal?(player: PlayerId, reason: Reason): void;
  giveBack(id: Id, player: Player): void;
  remove(id: Id): void;
  feedback: {
    remaining(id: Id, player: PlayerId, left: number): void;
    taken?(id: Id, player: PlayerId): void;
  };
} & TakeBackOrder<Id>;

export class TakeBackByHits<
  Id,
  Player extends PlayerId | undefined = PlayerId | undefined,
  Reason extends string = string,
> {
  private readonly counters: HitCounters<Id | string>;

  constructor(private readonly config: TakeBackConfig<Id, Player, Reason>) {
    this.counters = new HitCounters(config.rule);
  }

  hit(id: Id, now: number, player: Player): "taken" | "counted" | "refused" {
    const config = this.config;
    const reason = config.refusal?.(id);
    if (reason !== undefined) {
      if (player !== undefined) config.showRefusal?.(player, reason);
      return "refused";
    }

    this.counters.forgetStale(now);
    const { broken, hitsLeft } = this.counters.hit(config.key?.(id) ?? id, now);
    if (!broken) {
      if (player !== undefined) config.feedback.remaining(id, player, hitsLeft);
      return "counted";
    }

    for (const step of config.order) {
      switch (step) {
        case "release":
          config.release?.(id);
          break;
        case "giveBack":
          config.giveBack(id, player);
          break;
        case "remove":
          config.remove(id);
          break;
      }
    }
    if (player !== undefined) config.feedback.taken?.(id, player);
    return "taken";
  }
}
