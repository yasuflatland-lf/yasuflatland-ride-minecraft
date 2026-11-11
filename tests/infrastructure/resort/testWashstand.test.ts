import { beforeEach, expect, it, vi } from "vitest";
import { ShowStates } from "../../../src/application/resort/showStates";
import { TickShows } from "../../../src/application/resort/tickShows";
import { UseWashstand } from "../../../src/application/resort/useWashstand";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { WASHSTAND_SPEC } from "../../../src/domain/resort/shows";
import { BedrockShowSound } from "../../../src/infrastructure/resort/bedrock/bedrockShowSound";
import { BedrockWashstandWorld } from "../../../src/infrastructure/resort/bedrock/bedrockWashstandWorld";
import { registerTestWashstand } from "../../../src/infrastructure/resort/bedrock/handlers/testWashstand";
import {
  FURNITURE_IDS,
  TEST_WASHSTAND,
  WASHSTAND_RUNNING,
} from "../../../src/infrastructure/resort/identifiers";
import { fakeToiletWorld } from "../../application/resort/fakeToiletWorld";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  subscribe: vi.fn(),
  tick: 10,
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  ScriptEventSource: { Server: "Server" },
  system: {
    afterEvents: { scriptEventReceive: { subscribe: game.subscribe } },
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
  const dimension = {
    playSound: vi.fn(),
    getEntities: vi.fn(() => [{ id: "washstand" }]),
  };
  const entity = {
    isValid: true,
    typeId: FURNITURE_IDS.washstand.entity,
    dimension,
    location: { x: 0.5, y: 64, z: 0.5 },
    setProperty: vi.fn(),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === "washstand" ? entity : undefined,
  );
  game.getDimension.mockReturnValue(dimension);
  const states = new ShowStates();
  const adapter = new BedrockWashstandWorld();
  const useCase = new UseWashstand(adapter, states, new BedrockShowSound());
  const execute = vi.spyOn(useCase, "execute");
  registerTestWashstand(adapter, useCase);
  const send = (message: string, sourceType = "Server", id = TEST_WASHSTAND) =>
    game.subscribe.mock.calls[0]?.[0]({ id, message, sourceType });
  return {
    states,
    entity,
    dimension,
    send,
    execute,
    shows: new TickShows(fakeToiletWorld().world, adapter, states),
  };
}
it("dispatches run to the production use case and completes through the shared timer", () => {
  const f = fixture();
  expect(game.subscribe).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
    namespaces: ["yasu_ride_test"],
  });
  game.tick = 41;
  f.send("  washstand   run  ");
  expect(f.execute).toHaveBeenCalledExactlyOnceWith({
    id: "washstand",
    now: 41,
  });
  expect(f.states.washstands.get(asFurnitureId("washstand"))).toEqual({
    phase: "running",
    endsAt: 41 + WASHSTAND_SPEC.runTicks,
  });
  expect(f.entity.setProperty).toHaveBeenCalledExactlyOnceWith(
    WASHSTAND_RUNNING,
    true,
  );
  expect(f.dimension.playSound).toHaveBeenCalledExactlyOnceWith(
    WASHSTAND_SPEC.runSound,
    f.entity.location,
  );
  f.shows.tick(41 + WASHSTAND_SPEC.runTicks);
  expect(f.entity.setProperty).toHaveBeenLastCalledWith(
    WASHSTAND_RUNNING,
    false,
  );
});
it.each([
  "",
  "washstand",
  "washstand sit",
  "run washstand",
  "washstand run extra",
  "missing run",
])("ignores malformed or unloaded requests: %s", (message) => {
  const f = fixture();
  f.send(message);
  expect(f.execute).not.toHaveBeenCalled();
});
it("ignores non-server sources, other event ids, invalid and wrong-type entities", () => {
  const f = fixture();
  f.send("washstand run", "Entity");
  f.send("washstand run", "Server", "yasu_ride_test:other");
  f.entity.isValid = false;
  f.send("washstand run");
  f.entity.isValid = true;
  f.entity.typeId = FURNITURE_IDS.toilet.entity;
  f.send("washstand run");
  expect(f.execute).not.toHaveBeenCalled();
});
