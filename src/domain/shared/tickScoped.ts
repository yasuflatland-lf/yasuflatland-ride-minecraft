// State that holds for one game tick only: it is dropped as soon as a call
// passes a different tick, so callers never clear it by hand.

export class TickScopedMap<K, V> {
  private tick: number | undefined;
  private readonly entries = new Map<K, V>();

  get(tick: number, key: K): V | undefined {
    this.enter(tick);
    return this.entries.get(key);
  }

  set(tick: number, key: K, value: V): void {
    this.enter(tick);
    this.entries.set(key, value);
  }

  private enter(tick: number): void {
    if (tick === this.tick) return;
    this.entries.clear();
    this.tick = tick;
  }
}

export class TickScopedSet<K> {
  private readonly seen = new TickScopedMap<K, true>();

  /** Adds `key` for `tick`; true when it was not there yet in that tick. */
  add(tick: number, key: K): boolean {
    if (this.seen.get(tick, key)) return false;
    this.seen.set(tick, key, true);
    return true;
  }
}
