import type { PlayerId } from "../../shared/ids";
import type { InputControls } from "../controls";
import { SPEC } from "../spec";

export const NAV_GUIDES: Readonly<
  Record<InputControls, "nav_open_touch" | "nav_open_mouse" | "nav_open_other">
> = {
  touch: "nav_open_touch",
  mouse: "nav_open_mouse",
  other: "nav_open_other",
};

export type NavGuideTrigger = "select" | "tap";

export class NavGuideThrottle {
  private readonly shownAt = new Map<PlayerId, number>();

  allow(playerId: PlayerId, tick: number, trigger: NavGuideTrigger): boolean {
    for (const [id, previousTick] of this.shownAt) {
      if (tick - previousTick >= SPEC.navGuideInterval) this.shownAt.delete(id);
    }
    if (trigger === "tap" && this.shownAt.has(playerId)) return false;
    this.shownAt.set(playerId, tick);
    return true;
  }
}
