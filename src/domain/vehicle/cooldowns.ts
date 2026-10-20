// Cooldowns the vehicle keeps between ticks: the headlight switch (ADR 0024) and ram hits (ADR 0006).
import { SPEC } from "./spec";

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

/** When each ram target was last hit, so one target is not hit again within SPEC.ramCooldown (ADR 0006). */
export class RamCooldowns {
  private readonly lastHit = new Map<string, number>();

  /** Forgets targets whose cooldown has run out at `tick`. */
  prune(tick: number): void {
    for (const [id, t] of this.lastHit)
      if (tick - t >= SPEC.ramCooldown) this.lastHit.delete(id);
  }

  /** Last hit tick per target id, as `selectHits` reads it. */
  get recent(): ReadonlyMap<string, number> {
    return this.lastHit;
  }

  record(hits: readonly { readonly id: string }[], tick: number): void {
    for (const h of hits) this.lastHit.set(h.id, tick);
  }
}
