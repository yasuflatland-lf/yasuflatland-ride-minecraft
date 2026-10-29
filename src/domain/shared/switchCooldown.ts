/** Ticks a light switch must sit idle before a use counts; a held touch repeats the use every 4-6 ticks on mobile (ADR 0024). */
export const LIGHT_SWITCH_COOLDOWN_TICKS = 10;

/** The headlight switch: a use counts only after the switch has been idle for the cooldown (ADR 0024). */
export class SwitchCooldown {
  private lastUseTick = Number.NEGATIVE_INFINITY;

  /**
   * Records a use at `tick` and returns whether the switch had been idle for
   * at least `cooldown` ticks before it. Every use restarts the idle time,
   * including one that does not count, so a held touch that repeats the use
   * flips the switch once.
   */
  tryUse(tick: number, cooldown: number): boolean {
    const idle = tick - this.lastUseTick;
    this.lastUseTick = tick;
    return idle >= cooldown;
  }
}

interface KeyUse {
  readonly cooldown: SwitchCooldown;
  lastTick: number;
}

/** One `SwitchCooldown` per key, for switches that many keys share the rule of (ADR 0024). */
export class SwitchCooldowns<K> {
  private readonly uses = new Map<K, KeyUse>();

  constructor(private readonly cooldown = LIGHT_SWITCH_COOLDOWN_TICKS) {}

  /** Records a use of `key` at `tick`; true when that key had been idle for the cooldown. */
  tryUse(key: K, tick: number): boolean {
    let use = this.uses.get(key);
    if (use === undefined) {
      use = { cooldown: new SwitchCooldown(), lastTick: tick };
      this.uses.set(key, use);
    }
    use.lastTick = tick;
    return use.cooldown.tryUse(tick, this.cooldown);
  }

  /** Drops keys idle for the full cooldown at `tick`; a later use of one counts exactly as before. */
  forgetIdle(tick: number): void {
    // A cooldown idle for its full length lets the next use count, as a fresh
    // one does, so dropping it changes nothing but keeps the map small.
    for (const [key, use] of this.uses)
      if (tick - use.lastTick >= this.cooldown) this.uses.delete(key);
  }
}
