import { beforeEach, expect, it, vi } from "vitest";
import { ShowStates } from "../../../src/application/resort/showStates";
import { TickShows } from "../../../src/application/resort/tickShows";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { TOILET_SPEC } from "../../../src/domain/resort/shows";
import { BedrockShowSound } from "../../../src/infrastructure/resort/bedrock/bedrockShowSound";
import { BedrockToiletWorld } from "../../../src/infrastructure/resort/bedrock/bedrockToiletWorld";
import { registerTestToilet } from "../../../src/infrastructure/resort/bedrock/handlers/testToilet";
import {
  FURNITURE_IDS,
  TEST_TOILET,
  TOILET_FLUSHING,
  TOILET_LID_OPEN,
} from "../../../src/infrastructure/resort/identifiers";
import { fakeWashstandWorld } from "../../application/resort/fakeWashstandWorld";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  subscribe: vi.fn(),
  tick: 10,
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Creative: "Creative" },
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
    getEntities: vi.fn(() => [{ id: "toilet" }]),
  };
  const entity = {
    isValid: true,
    typeId: FURNITURE_IDS.toilet.entity,
    dimension,
    location: { x: 0.5, y: 64, z: 0.5 },
    setProperty: vi.fn(),
    getComponent: vi.fn(() => undefined),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === "toilet" ? entity : undefined,
  );
  game.getDimension.mockReturnValue(dimension);
  const deps = { isVehicleSpace: () => false, isCampSpace: () => false };
  const states = new ShowStates();
  const sound = new BedrockShowSound();
  registerTestToilet(states, sound, deps);
  const send = (message: string, sourceType = "Server", id = TEST_TOILET) =>
    game.subscribe.mock.calls[0]?.[0]({ id, message, sourceType });
  return {
    states,
    entity,
    dimension,
    send,
    shows: new TickShows(
      new BedrockToiletWorld(deps),
      fakeWashstandWorld(),
      states,
    ),
  };
}
it("runs playerless sit and dismount through the shared state and production show timer", () => {
  const f = fixture();
  expect(game.subscribe).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
    namespaces: ["yasu_ride_test"],
  });
  f.send("  toilet   sit  ");
  expect(f.states.toilets.get(asFurnitureId("toilet"))).toEqual({
    phase: "seated",
    rider: "test-toilet",
  });
  expect(f.entity.setProperty).toHaveBeenCalledExactlyOnceWith(
    TOILET_LID_OPEN,
    true,
  );
  expect(f.dimension.playSound).not.toHaveBeenCalled();
  game.tick = 27;
  f.send("toilet dismount");
  expect(f.states.toilets.get(asFurnitureId("toilet"))).toEqual({
    phase: "flushing",
    endsAt: 27 + TOILET_SPEC.flushTicks,
  });
  expect(f.entity.setProperty).toHaveBeenLastCalledWith(TOILET_FLUSHING, true);
  expect(f.dimension.playSound).toHaveBeenCalledExactlyOnceWith(
    TOILET_SPEC.flushSound,
    f.entity.location,
  );
  f.send("toilet dismount");
  expect(f.dimension.playSound).toHaveBeenCalledTimes(1);
  f.shows.tick(26 + TOILET_SPEC.flushTicks);
  expect(f.entity.setProperty).toHaveBeenCalledTimes(2);
  f.shows.tick(27 + TOILET_SPEC.flushTicks);
  expect(f.entity.setProperty.mock.calls.slice(-2)).toEqual([
    [TOILET_FLUSHING, false],
    [TOILET_LID_OPEN, false],
  ]);
  expect(f.states.toilets.get(asFurnitureId("toilet"))).toEqual({
    phase: "empty",
  });
});
it.each([
  "",
  "toilet",
  "toilet run",
  "sit toilet",
  "toilet sit extra",
  "toilet dismount extra",
  "missing sit",
  "missing dismount",
])("ignores malformed or unloaded requests: %s", (message) => {
  const f = fixture();
  f.send(message);
  expect(f.states.toilets.size).toBe(0);
  expect(f.entity.setProperty).not.toHaveBeenCalled();
});
it("ignores non-server sources, other event ids, invalid and wrong-type entities", () => {
  const f = fixture();
  f.send("toilet sit", "Entity");
  f.send("toilet sit", "Server", "yasu_ride_test:other");
  f.entity.isValid = false;
  f.send("toilet sit");
  f.entity.isValid = true;
  f.entity.typeId = FURNITURE_IDS.washstand.entity;
  f.send("toilet sit");
  expect(f.states.toilets.size).toBe(0);
  expect(f.entity.setProperty).not.toHaveBeenCalled();
});
