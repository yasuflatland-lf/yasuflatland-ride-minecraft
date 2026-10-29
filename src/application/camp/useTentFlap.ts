// Use case: a tap on a tent flap flips only that flap's target; the tent loop lays and sends it (ADR 0132).
import type { FlapId, TentId } from "../../domain/camp/tent";
import type { PlayerId } from "../../domain/shared/ids";
import type { TentFlapWorld } from "./ports/tentFlap";

export interface UseTentFlapCommand {
  tentId: TentId;
  flap: FlapId;
  tick: number;
  /** The player who tapped; none for a test event. */
  playerId?: PlayerId;
}

export class UseTentFlap {
  constructor(private readonly world: TentFlapWorld) {}

  /** True when the flap's target flipped. */
  execute(cmd: UseTentFlapCommand): boolean {
    const flaps = this.world.flapsOf(cmd.tentId);
    if (!flaps) return false;
    // The echo of the tap that just toggled the flap (ADR 0105).
    if (flaps.withinWindow(cmd.flap, cmd.tick)) return false;
    // Checked before the toggle, so a refused close does not use up the window.
    if (
      flaps.isOpen(cmd.flap) &&
      this.world.isFlapBlocked(cmd.tentId, cmd.flap)
    ) {
      if (cmd.playerId !== undefined) this.world.showFlapBlocked(cmd.playerId);
      return false;
    }
    return flaps.toggle(cmd.flap, cmd.tick);
  }
}
