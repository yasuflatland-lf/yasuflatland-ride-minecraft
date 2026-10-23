// Cooldowns the vehicle keeps between ram hits (ADR 0006).
import { SPEC } from "./spec";

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
