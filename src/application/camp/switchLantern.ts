// Use case: the headlight switch used inside a tent flips its lantern (ADR 0024, 0134).
import type { TentId } from "../../domain/camp/tent";
import {
  LIGHT_SWITCH_COOLDOWN_TICKS,
  SwitchCooldown,
} from "../../domain/shared/switchCooldown";
import type { LanternWorld } from "./ports/lantern";

export interface SwitchLanternCommand {
  tentId: TentId;
  tick: number;
}

interface Use {
  readonly cooldown: SwitchCooldown;
  lastTick: number;
}

export class SwitchLantern {
  // One cooldown per tent, shared by everyone in it, as the camper's room shares one.
  private readonly uses = new Map<TentId, Use>();

  constructor(private readonly world: LanternWorld) {}

  /** Returns whether the lantern turned on or off. */
  execute(cmd: SwitchLanternCommand): boolean {
    this.forgetIdle(cmd.tick);
    const on = this.world.lanternOf(cmd.tentId);
    if (on === undefined) return false;
    let use = this.uses.get(cmd.tentId);
    if (!use) {
      use = { cooldown: new SwitchCooldown(), lastTick: cmd.tick };
      this.uses.set(cmd.tentId, use);
    }
    use.lastTick = cmd.tick;
    if (!use.cooldown.tryUse(cmd.tick, LIGHT_SWITCH_COOLDOWN_TICKS))
      return false;
    this.world.setLantern(cmd.tentId, !on);
    return true;
  }

  // A cooldown idle for its full length lets the next use count, as a fresh
  // one does, so dropping it changes nothing but keeps the map small.
  private forgetIdle(tick: number): void {
    for (const [id, use] of this.uses)
      if (tick - use.lastTick >= LIGHT_SWITCH_COOLDOWN_TICKS)
        this.uses.delete(id);
  }
}
