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

function isStale(counter: HitCounter, tick: number, rule: HitRule): boolean {
  return tick - counter.lastTick > rule.resetTicks;
}

export function registerHit(
  counter: HitCounter,
  tick: number,
  occupied: boolean,
  rule: HitRule,
): { counter: HitCounter; broken: boolean } {
  if (occupied) return { counter, broken: false };
  const count = (isStale(counter, tick, rule) ? 0 : counter.count) + 1;
  if (count >= rule.hits) {
    return { counter: EMPTY_COUNTER, broken: true };
  }
  return { counter: { count, lastTick: tick }, broken: false };
}

export class HitCounters<K> {
  private readonly counters = new Map<K, HitCounter>();

  constructor(private readonly rule: HitRule) {}

  /**
   * Registers a hit on `key` at `tick`. A broken result drops the key.
   * When `occupied`, nothing is stored or dropped and the result is never broken.
   * `hitsLeft` is meaningful only when neither broken nor occupied.
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

  /** Drops counters past their reset window at `tick`; a later hit on one counts exactly as before. */
  forgetStale(tick: number): void {
    // A counter past its reset window counts as empty, so dropping it changes
    // nothing but keeps keys hit once from piling up.
    for (const [key, counter] of this.counters)
      if (isStale(counter, tick, this.rule)) this.counters.delete(key);
  }
}
