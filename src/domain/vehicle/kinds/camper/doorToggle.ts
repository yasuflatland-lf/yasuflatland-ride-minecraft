import { CAMPER_SPEC } from "./spec";

/**
 * Taps on one camper door. A single tap can reach the door's block twice, 3-4
 * ticks apart, both as a first event, so a tap toggles the door only when the
 * last toggle was at least a swing (CAMPER_SPEC.doorSwingTicks) earlier. An
 * ignored tap does not restart the time, so tapping again right after the swing
 * still works (ADR 0105).
 */
export class DoorToggle {
  private lastToggleTick = Number.NEGATIVE_INFINITY;

  /** Records a tap at `tick`; true when it toggles the door. */
  tryToggle(tick: number): boolean {
    if (this.withinSwing(tick)) return false;
    this.lastToggleTick = tick;
    return true;
  }

  /** Whether `tick` is within a swing of the last toggle, when `tryToggle` would ignore a tap. */
  withinSwing(tick: number): boolean {
    return tick - this.lastToggleTick < CAMPER_SPEC.doorSwingTicks;
  }
}
