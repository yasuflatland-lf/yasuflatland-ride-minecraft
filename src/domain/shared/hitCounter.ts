// Counts the hits that take something down: a vehicle back into its item (ADR
// 0008) and camp gear take-back: chair, table, tent, fire pit and Dutch oven
// (ADR 0122, 0131). Each caller passes its own rule.

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

export class HitCounters<K> {
  private readonly counters = new Map<K, HitCounter>();

  constructor(private readonly rule: HitRule) {}

  /**
   * A broken result drops the key; occupied hits leave it unchanged.
   * hitsLeft is meaningful only when neither broken nor occupied.
   */
  hit(
    key: K,
    tick: number,
    occupied: boolean,
  ): { broken: boolean; hitsLeft: number } {
    const result = registerHit(
      this.counters.get(key) ?? EMPTY_COUNTER,
      tick,
      occupied,
      this.rule,
    );
    if (!occupied) {
      if (result.broken) this.counters.delete(key);
      else this.counters.set(key, result.counter);
    }
    return {
      broken: result.broken,
      hitsLeft: this.rule.hits - result.counter.count,
    };
  }

  forgetStale(tick: number): void {
    // A counter past its reset window counts as empty, so dropping it changes
    // nothing but keeps keys hit once from piling up.
    for (const [key, counter] of this.counters) {
      if (tick - counter.lastTick > this.rule.resetTicks)
        this.counters.delete(key);
    }
  }
}
