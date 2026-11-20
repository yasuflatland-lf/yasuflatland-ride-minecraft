import type { HitCounters } from "../../domain/shared/hitCounter";

export interface TakeBackEffects {
  drop(): void;
  remove(): void;
  showRemaining(left: number): void;
}

/** Registers one hit; on the last one drops and removes the item, otherwise shows the hits left. */
export function handleHit<Id>(
  counters: HitCounters<Id>,
  id: Id,
  now: number,
  effects: TakeBackEffects,
): void {
  counters.forgetStale(now);
  const result = counters.hit(id, now);
  if (result.broken) {
    effects.drop();
    effects.remove();
    return;
  }
  effects.showRemaining(result.hitsLeft);
}
