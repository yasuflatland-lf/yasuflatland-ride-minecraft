import { beforeEach, expect, it, vi } from "vitest";
import type { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import type { FirePitActions } from "../../../src/application/camp/firePit";
import type { FirePitWorld } from "../../../src/application/camp/ports/firePit";
import { asDutchOvenId } from "../../../src/domain/camp/dutchOven";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import { DUTCH_OVEN_SPEC } from "../../../src/domain/camp/spec";
import { BedrockDutchOvenWorld } from "../../../src/infrastructure/camp/bedrock/bedrockDutchOvenWorld";
import { BedrockFirePitWorld } from "../../../src/infrastructure/camp/bedrock/bedrockFirePitWorld";
import { registerDutchOven } from "../../../src/infrastructure/camp/bedrock/handlers/dutchOven";
import { registerFirePit } from "../../../src/infrastructure/camp/bedrock/handlers/firePit";
import {
  DUTCH_OVEN_GROUND_EVENT,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_HOSTED_EVENT,
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_COVERED_PROPERTY,
  FIRE_PIT_TYPE,
  TEST_DUTCH_OVEN_ON_PIT_EVENT,
} from "../../../src/infrastructure/camp/identifiers";
import { defined } from "../../support/defined";

const game = vi.hoisted(() => ({
  entity: vi.fn(),
  block: vi.fn(),
  dimension: vi.fn(),
  interact: vi.fn(),
  run: vi.fn(),
  interval: vi.fn(),
  script: vi.fn(),
  tick: 10,
}));
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
  Player: class {},
  ScriptEventSource: { Server: "Server" },
  world: {
    getEntity: game.entity,
    getDimension: game.dimension,
    beforeEvents: {
      playerInteractWithBlock: { subscribe: vi.fn() },
      playerInteractWithEntity: { subscribe: game.interact },
    },
    afterEvents: { entityHitEntity: { subscribe: vi.fn() } },
  },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runInterval: game.interval,
    afterEvents: { scriptEventReceive: { subscribe: game.script } },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  game.tick = 10;
});

function handlers() {
  const placeOnFirePit = vi.fn();
  const checkHosts = vi.fn();
  const toggle = vi.fn();
  registerDutchOven({
    placeOnFirePit,
    checkHosts,
  } as unknown as DutchOvenActions);
  registerFirePit({ toggle } as unknown as FirePitActions, {} as FirePitWorld);
  const press = (held: string | undefined = DUTCH_OVEN_ITEM) => {
    const event = {
      cancel: false,
      target: { id: "pit", typeId: FIRE_PIT_TYPE },
      itemStack: held ? { typeId: held } : undefined,
      player: { id: "p", selectedSlotIndex: 3 },
    };
    for (const [handler] of game.interact.mock.calls) handler(event);
    return event;
  };
  const flush = () => {
    for (const [callback] of game.run.mock.calls) callback();
    game.run.mockClear();
  };
  return { placeOnFirePit, checkHosts, toggle, press, flush };
}

it("oven interactions win over pit interactions and dedupe before deferred placement", () => {
  const { press, flush, placeOnFirePit, toggle } = handlers();
  expect(press().cancel).toBe(true);
  press();
  expect(placeOnFirePit).not.toHaveBeenCalled();
  expect(game.run).toHaveBeenCalledTimes(1);
  flush();
  expect(placeOnFirePit).toHaveBeenCalledExactlyOnceWith({
    player: "p",
    pit: "pit",
    slot: 3,
  });
  expect(toggle).not.toHaveBeenCalled();
  game.tick++;
  press();
  flush();
  expect(placeOnFirePit).toHaveBeenCalledTimes(2);
});

it("keeps fire pit interactions for every other held item and empty hands", () => {
  const { press, flush, placeOnFirePit, toggle } = handlers();
  for (const held of ["minecraft:flint_and_steel", "minecraft:stick", ""]) {
    game.tick++;
    press(held);
    flush();
  }
  expect(toggle).toHaveBeenCalledTimes(3);
  expect(placeOnFirePit).not.toHaveBeenCalled();
});

it("schedules host checks at the spec interval and exposes server-only test placement", () => {
  const { checkHosts, placeOnFirePit } = handlers();
  const check = game.interval.mock.calls.find(
    (call) => call[1] === DUTCH_OVEN_SPEC.hostCheckTicks,
  );
  defined(check, "host interval")[0]();
  expect(checkHosts).toHaveBeenCalledOnce();
  const script = defined(game.script.mock.calls[0], "oven script handler")[0];
  script({
    id: TEST_DUTCH_OVEN_ON_PIT_EVENT,
    message: "pit",
    sourceType: "Entity",
  });
  expect(placeOnFirePit).not.toHaveBeenCalled();
  script({
    id: TEST_DUTCH_OVEN_ON_PIT_EVENT,
    message: "pit",
    sourceType: "Server",
  });
  expect(placeOnFirePit).toHaveBeenCalledWith({ pit: "pit", slot: 0 });
});

it("emits bubbles and steam only for simmering ovens", () => {
  handlers();
  const spawnParticle = vi.fn();
  game.dimension.mockReturnValue({
    getEntities: () => [
      { location: { x: 1, y: 2, z: 3 }, getProperty: () => true },
      { getProperty: () => false },
    ],
    spawnParticle,
  });
  defined(game.interval.mock.calls[1], "steam interval")[0]();
  expect(spawnParticle).toHaveBeenCalledTimes(6);
  expect(spawnParticle).toHaveBeenCalledWith("minecraft:basic_smoke_particle", {
    x: 1,
    y: 2.35,
    z: 3,
  });
  expect(spawnParticle).toHaveBeenCalledWith(
    "minecraft:basic_bubble_particle",
    { x: expect.any(Number), y: 2.22, z: expect.any(Number) },
  );
});

it("shares the covered property and returns the host's actual position and yaw", () => {
  let covered = false;
  const pit = {
    isValid: true,
    typeId: FIRE_PIT_TYPE,
    dimension: { id: "overworld" },
    location: { x: 1, y: 2, z: 3 },
    getRotation: () => ({ y: -45 }),
    getProperty: (key: string) => key === FIRE_PIT_COVERED_PROPERTY && covered,
    setProperty: (_key: string, value: boolean) => {
      covered = value;
    },
  };
  game.entity.mockReturnValue(pit);
  const ovens = new BedrockDutchOvenWorld({ isVehicleSpace: () => false });
  const pits = new BedrockFirePitWorld({ isVehicleSpace: () => false });
  const id = asFirePitId("pit");
  expect(ovens.firePit(id)).toEqual({
    dimension: "overworld",
    at: pit.location,
    yaw: -45,
  });
  ovens.setCovered(id, true);
  expect(pits.isCovered(id)).toBe(true);
  pits.setCovered(id, false);
  expect(ovens.isCovered(id)).toBe(false);
});

it("switches physics with the host and defers cleanup in unloaded blocks", () => {
  const entity = {
    isValid: true,
    typeId: DUTCH_OVEN_TYPE,
    location: { x: 1, y: 2, z: 3 },
    dimension: { getBlock: game.block },
    setDynamicProperty: vi.fn(),
    setProperty: vi.fn(),
    triggerEvent: vi.fn(),
    clearVelocity: vi.fn(),
    getDynamicProperty: () => "fire_pit:pit:0",
  };
  game.entity.mockReturnValue(entity);
  const ovens = new BedrockDutchOvenWorld({ isVehicleSpace: () => false });
  const id = asDutchOvenId("oven");
  ovens.setHost(id, "fire_pit:pit:0", true);
  expect(entity.setDynamicProperty).toHaveBeenCalledWith(
    DUTCH_OVEN_HOST_PROPERTY,
    "fire_pit:pit:0",
  );
  expect(entity.setProperty).toHaveBeenCalledWith(
    DUTCH_OVEN_SIMMERING_PROPERTY,
    true,
  );
  expect(entity.triggerEvent).toHaveBeenCalledWith(DUTCH_OVEN_HOSTED_EVENT);
  ovens.setHost(id, "", false);
  expect(entity.triggerEvent).toHaveBeenCalledWith(DUTCH_OVEN_GROUND_EVENT);
  expect(ovens.host(id)).toBe("fire_pit:pit:0");
  game.block.mockReturnValue({});
  expect(ovens.isHostAreaLoaded(id)).toBe(true);
  game.block.mockReturnValue(undefined);
  expect(ovens.isHostAreaLoaded(id)).toBe(false);
  game.block.mockImplementation(() => {
    throw new Error("unloaded");
  });
  expect(ovens.isHostAreaLoaded(id)).toBe(false);
});
