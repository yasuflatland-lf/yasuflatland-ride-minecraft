import type { HitCounters } from "../../domain/shared/hitCounter";

export interface TakeBackEffects {
  drop(): void;
  remove(): void;
  showRemaining(left: number): void;
}

/** Registers one hit; on the last one drops and removes the item in the given order, otherwise shows the hits left. */
export function handleHit<Id>(
  counters: HitCounters<Id>,
  id: Id,
  now: number,
  effects: TakeBackEffects,
  order: "dropThenRemove" | "removeThenDrop" = "dropThenRemove",
): { broken: boolean } {
  counters.forgetStale(now);
  const { broken, hitsLeft } = counters.hit(id, now);
  if (!broken) {
    effects.showRemaining(hitsLeft);
  } else if (order === "removeThenDrop") {
    effects.remove();
    effects.drop();
  } else {
    effects.drop();
    effects.remove();
  }
  return { broken };
}
