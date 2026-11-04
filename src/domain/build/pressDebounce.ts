export class PressDebounce {
  private lastTick = Number.NEGATIVE_INFINITY;

  constructor(private readonly windowTicks: number) {}

  press(tick: number): boolean {
    const gap = tick - this.lastTick;
    this.lastTick = tick;
    return gap >= this.windowTicks;
  }
}

export class PressDebounces<K> {
  private readonly presses = new Map<K, PressDebounce>();

  constructor(private readonly windowTicks: number) {}

  press(key: K, tick: number): boolean {
    let debounce = this.presses.get(key);
    if (!debounce) {
      debounce = new PressDebounce(this.windowTicks);
      this.presses.set(key, debounce);
    }
    return debounce.press(tick);
  }

  remove(key: K): void {
    this.presses.delete(key);
  }
}
