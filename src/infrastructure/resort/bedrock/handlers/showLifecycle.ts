import { system } from "@minecraft/server";
import type { TickShows } from "../../../../application/resort/tickShows";
import type { WatchToiletDismount } from "../../../../application/resort/watchToiletDismount";
import { TOILET_SPEC } from "../../../../domain/resort/shows";

const SHOW_TICK_INTERVAL = 1;

export function registerShowLifecycle(
  watch: WatchToiletDismount,
  shows: TickShows,
): void {
  system.runInterval(() => watch.refresh(), TOILET_SPEC.scanTicks);
  system.runInterval(() => shows.tick(system.currentTick), SHOW_TICK_INTERVAL);
}
