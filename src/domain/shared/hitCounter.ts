import { type Ticks, ticks } from "./ticks";

export interface HitCounter {
  readonly count: number;
  readonly lastTick: number;
}

export interface HitRule {
  /** Consecutive hits required, as an integer of at least one. */
  readonly hits: number;
  /** A gap longer than this starts the count again. */
  readonly resetTicks: Ticks;
}

/** Validates the hit count and freezes the rule. */
export function hitRule(hits: number, resetTicks: Ticks): HitRule {
  if (!Number.isInteger(hits) || hits < 1)
    throw new RangeError(`Hits must be a positive integer, got ${hits}`);
  return Object.freeze({ hits, resetTicks });
}

/** Three hits with gaps of at most 100 ticks for camp and resort gear (ADR 0122, 0131, 0200, 0240). */
export const GEAR_RECOVERY: HitRule = hitRule(3, ticks(100));

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
   * `hitsLeft` describes progress toward the next break.
   */
  hit(key: K, tick: number): { broken: boolean; hitsLeft: number } {
    const result = registerHit(
      this.counters.get(key) ?? EMPTY_COUNTER,
      tick,
      false,
      this.rule,
    );
    if (result.broken) this.counters.delete(key);
    else this.counters.set(key, result.counter);
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
