import { vi } from "vitest";
import type { ShowSound } from "../../../src/application/resort/ports/showSound";
import { ShowStates } from "../../../src/application/resort/showStates";
import { TickShows } from "../../../src/application/resort/tickShows";
import { UseToilet } from "../../../src/application/resort/useToilet";
import { UseWashstand } from "../../../src/application/resort/useWashstand";
import { WatchToiletDismount } from "../../../src/application/resort/watchToiletDismount";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { fakeToiletWorld } from "./fakeToiletWorld";
import { fakeWashstandWorld } from "./fakeWashstandWorld";

export const toilet = asFurnitureId("toilet");
export const washstand = asFurnitureId("washstand");
export const player = asPlayerId("player");

export function showFixture() {
  const { world: toilets, riders } = fakeToiletWorld([toilet]);
  const washstands = fakeWashstandWorld([washstand]);
  const sound = { playAt: vi.fn<ShowSound["playAt"]>() } satisfies ShowSound;
  const states = new ShowStates();
  const clock = { now: 0 };
  const watch = new WatchToiletDismount(
    toilets,
    states,
    sound,
    () => clock.now,
  );
  return {
    toilets,
    washstands,
    riders,
    sound,
    states,
    clock,
    watch,
    useToilet: new UseToilet(toilets, states, watch),
    useWashstand: new UseWashstand(washstands, states, sound),
    ticks: new TickShows(toilets, washstands, states),
  };
}
