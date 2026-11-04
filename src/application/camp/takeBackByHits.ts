// Shared flow of the camp items taken back by hitting them a few times in a row (ADR 0122, 0131).
import type { HitCounters } from "../../domain/shared/hitCounter";

export interface TakeBackEffects {
  drop(): void;
  remove(): void;
  showRemaining(left: number): void;
}

/** Registers one hit; on the last one drops and removes the item, otherwise shows the hits left. */
export function handleHit<Id>(
  rule: { hits: number; resetTicks: number },
  counters: HitCounters<Id>,
  id: Id,
  now: number,
  effects: TakeBackEffects,
): void {
  counters.forgetStale(now);
  const result = counters.hit(id, now, false);
  if (result.broken) {
    effects.drop();
    effects.remove();
    return;
  }
  effects.showRemaining(result.hitsLeft);
}
