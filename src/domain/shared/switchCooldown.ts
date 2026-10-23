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
