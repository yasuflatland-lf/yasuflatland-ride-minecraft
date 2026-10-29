/**
 * One tap can reach a block twice, 3-4 ticks apart, both as a first event, so a
 * tap toggles only when the last toggle was at least `windowTicks` earlier.
 * An ignored tap does not restart the window, so tapping again right after it
 * still toggles (ADR 0105). Each caller passes its own window.
 */
export class TapToggle {
  private lastToggleTick = Number.NEGATIVE_INFINITY;

  constructor(private readonly windowTicks: number) {}

  /** Records a tap at `tick`; true when it toggles. */
  tryToggle(tick: number): boolean {
    if (this.withinWindow(tick)) return false;
    this.lastToggleTick = tick;
    return true;
  }

  /** Whether `tick` is within the window of the last toggle, when `tryToggle` would ignore a tap. */
  withinWindow(tick: number): boolean {
    return tick - this.lastToggleTick < this.windowTicks;
  }
}
