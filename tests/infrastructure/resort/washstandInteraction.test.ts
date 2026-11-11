import { beforeEach, expect, it, vi } from "vitest";
import { ShowStates } from "../../../src/application/resort/showStates";
import { UseWashstand } from "../../../src/application/resort/useWashstand";
import { registerWashstandInteraction } from "../../../src/infrastructure/resort/bedrock/handlers/washstandInteraction";
import { FURNITURE_IDS } from "../../../src/infrastructure/resort/identifiers";

import { fakeWashstandWorld } from "../../application/resort/fakeWashstandWorld";

const game = vi.hoisted(() => ({
  subscribe: vi.fn(),
  run: vi.fn(),
  tick: 10,
}));
vi.mock("@minecraft/server", () => ({
  world: {
    beforeEvents: { playerInteractWithEntity: { subscribe: game.subscribe } },
  },
  system: {
    run: game.run,
    get currentTick() {
      return game.tick;
    },
  },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  game.tick = 10;
});
function fixture() {
  const states = new ShowStates();
  const sound = { playAt: vi.fn() };
  const world = fakeWashstandWorld();
  const useCase = new UseWashstand(world, states, sound);
  const execute = vi.spyOn(useCase, "execute").mockImplementation(() => {});
  registerWashstandInteraction(useCase);
  const press = (player = "p", typeId = FURNITURE_IDS.washstand.entity) => {
    const ev = {
      player: { id: player },
      target: { id: "furniture", typeId },
      cancel: false,
    };
    game.subscribe.mock.calls[0]?.[0](ev);
    return ev;
  };
  return { execute, press };
}
it("ignores other entity types", () => {
  const f = fixture();
  expect(f.press("p", "minecraft:pig").cancel).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
  expect(f.execute).not.toHaveBeenCalled();
});
it("cancels and defers one request per player per tick, using the execution tick", () => {
  const f = fixture();
  expect(f.press().cancel).toBe(true);
  expect(f.press().cancel).toBe(true);
  expect(game.run).toHaveBeenCalledTimes(1);
  expect(f.execute).not.toHaveBeenCalled();
  game.tick = 11;
  game.run.mock.calls[0]?.[0]();
  expect(f.execute).toHaveBeenCalledExactlyOnceWith({
    id: "furniture",
    now: 11,
  });
});
it("accepts different players in one tick and the same player in the next tick", () => {
  const f = fixture();
  f.press("p");
  f.press("q");
  game.tick++;
  f.press("p");
  f.press("p");
  expect(game.run).toHaveBeenCalledTimes(3);
  for (const [run] of game.run.mock.calls) run();
  expect(f.execute).toHaveBeenCalledTimes(3);
});
