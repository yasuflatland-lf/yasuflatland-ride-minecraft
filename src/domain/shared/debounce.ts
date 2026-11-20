/** Ticks a light switch must sit idle before a use counts (ADR 0024). */
export const LIGHT_SWITCH_COOLDOWN_TICKS = 10;

function validateWindow(window: number): void {
  if (!Number.isInteger(window) || window < 0)
    throw new RangeError("Invalid debounce window");
}

/** One press stream. */
export class Debounce {
  private lastTick = Number.NEGATIVE_INFINITY;

  constructor(private readonly window: number) {
    validateWindow(window);
  }

  press(tick: number): boolean {
    const ok = this.ready(tick);
    this.record(tick);
    return ok;
  }

  ready(tick: number): boolean {
    return tick - this.lastTick >= this.window;
  }

  record(tick: number): void {
    this.lastTick = tick;
  }
}

/** One debounce per key with the same window. */
export class Debounces<K> {
  private readonly presses = new Map<K, Debounce>();

  constructor(private readonly window: number) {
    validateWindow(window);
  }

  press(key: K, tick: number): boolean {
    const ok = this.ready(key, tick);
    this.record(key, tick);
    return ok;
  }

  ready(key: K, tick: number): boolean {
    return this.presses.get(key)?.ready(tick) ?? true;
  }

  record(key: K, tick: number): void {
    let debounce = this.presses.get(key);
    if (debounce === undefined) {
      debounce = new Debounce(this.window);
      this.presses.set(key, debounce);
    }
    debounce.record(tick);
  }

  forget(key: K): void {
    this.presses.delete(key);
  }

  forgetIdle(tick: number): void {
    for (const [key, debounce] of this.presses) {
      if (debounce.ready(tick)) this.presses.delete(key);
    }
  }
}
