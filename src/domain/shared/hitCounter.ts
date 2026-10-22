// Counts the hits that take something down: a vehicle back into its item (ADR
// 0008) and the low chair (ADR 0122). Each caller passes its own rule.

export interface HitCounter {
  readonly count: number;
  readonly lastTick: number;
}

export interface HitRule {
  /** Hits in a row that take it down. */
  readonly hits: number;
  /** A gap longer than this, in ticks, starts the count again. */
  readonly resetTicks: number;
}

export const EMPTY_COUNTER: HitCounter = Object.freeze({
  count: 0,
  lastTick: Number.NEGATIVE_INFINITY,
});

export function registerHit(
  counter: HitCounter,
  tick: number,
  occupied: boolean,
  rule: HitRule,
): { counter: HitCounter; broken: boolean } {
  if (occupied) return { counter, broken: false };
  const isStale = tick - counter.lastTick > rule.resetTicks;
  const count = (isStale ? 0 : counter.count) + 1;
  if (count >= rule.hits) {
    return { counter: EMPTY_COUNTER, broken: true };
  }
  return { counter: { count, lastTick: tick }, broken: false };
}
