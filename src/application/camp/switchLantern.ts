// Use case: the headlight switch used inside a tent flips its lantern (ADR 0024, 0134).
import type { TentId } from "../../domain/camp/tent";
import {
  Debounces,
  LIGHT_SWITCH_COOLDOWN_TICKS,
} from "../../domain/shared/debounce";
import type { LanternWorld } from "./ports/lantern";

interface SwitchLanternCommand {
  tentId: TentId;
  tick: number;
}

export class SwitchLantern {
  // One cooldown per tent, shared by everyone in it, as the camper's room shares one.
  private readonly cooldowns = new Debounces<TentId>(
    LIGHT_SWITCH_COOLDOWN_TICKS,
  );

  constructor(private readonly world: LanternWorld) {}

  /** Returns whether the lantern turned on or off. */
  execute(cmd: SwitchLanternCommand): boolean {
    this.cooldowns.forgetIdle(cmd.tick);
    const on = this.world.lanternOf(cmd.tentId);
    if (on === undefined) return false;
    if (!this.cooldowns.press(cmd.tentId, cmd.tick)) return false;
    this.world.setLantern(cmd.tentId, !on);
    return true;
  }
}
