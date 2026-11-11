import { beforeEach, expect, it, vi } from "vitest";
import { ShowStates } from "../../../src/application/resort/showStates";
import { TickShows } from "../../../src/application/resort/tickShows";
import { WatchToiletDismount } from "../../../src/application/resort/watchToiletDismount";
import { TOILET_SPEC } from "../../../src/domain/resort/shows";
import { registerShowLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/showLifecycle";
import { fakeToiletWorld } from "../../application/resort/fakeToiletWorld";
import { fakeWashstandWorld } from "../../application/resort/fakeWashstandWorld";

const game = vi.hoisted(() => ({ interval: vi.fn(), tick: 10 }));
vi.mock("@minecraft/server", () => ({
  system: {
    runInterval: game.interval,
    get currentTick() {
      return game.tick;
    },
  },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("registers the rider scan and each-tick show completion with live ticks", () => {
  const states = new ShowStates();
  const { world } = fakeToiletWorld();
  const watch = new WatchToiletDismount(
    world,
    states,
    { playAt: vi.fn() },
    () => game.tick,
  );
  const shows = new TickShows(world, fakeWashstandWorld(), states);
  const refresh = vi.spyOn(watch, "refresh").mockImplementation(() => {});
  const tick = vi.spyOn(shows, "tick").mockImplementation(() => {});
  registerShowLifecycle(watch, shows);
  expect(game.interval.mock.calls.map(([, interval]) => interval)).toEqual([
    TOILET_SPEC.scanTicks,
    1,
  ]);
  expect(refresh).not.toHaveBeenCalled();
  expect(tick).not.toHaveBeenCalled();
  game.interval.mock.calls[0]?.[0]();
  expect(refresh).toHaveBeenCalledExactlyOnceWith();
  game.tick = 17;
  game.interval.mock.calls[1]?.[0]();
  expect(tick).toHaveBeenCalledExactlyOnceWith(17);
  game.tick = 31;
  game.interval.mock.calls[1]?.[0]();
  expect(tick).toHaveBeenLastCalledWith(31);
});
