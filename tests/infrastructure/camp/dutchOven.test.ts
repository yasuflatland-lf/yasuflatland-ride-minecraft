import { beforeEach, expect, it, vi } from "vitest";
import type { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import type { FirePitActions } from "../../../src/application/camp/firePit";
import type { FirePitWorld } from "../../../src/application/camp/ports/firePit";
import { asDutchOvenId } from "../../../src/domain/camp/dutchOven";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  DUTCH_OVEN_SPEC,
} from "../../../src/domain/camp/spec";
import { BedrockDutchOvenWorld } from "../../../src/infrastructure/camp/bedrock/bedrockDutchOvenWorld";
import { BedrockFirePitWorld } from "../../../src/infrastructure/camp/bedrock/bedrockFirePitWorld";
import { registerDutchOven } from "../../../src/infrastructure/camp/bedrock/handlers/dutchOven";
import { registerFirePit } from "../../../src/infrastructure/camp/bedrock/handlers/firePit";
import {
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_GROUND_EVENT,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_HOSTED_EVENT,
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_COVERED_PROPERTY,
  FIRE_PIT_TYPE,
  TEST_DUTCH_OVEN_HOST_EVENT,
  TEST_DUTCH_OVEN_ON_PIT_EVENT,
  TEST_DUTCH_OVEN_ON_TABLE_EVENT,
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
  const placeOnTable = vi.fn();
  const checkHosts = vi.fn();
  const toggle = vi.fn();
  registerDutchOven({
    placeOnFirePit,
    placeOnTable,
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
  return { placeOnFirePit, placeOnTable, checkHosts, toggle, press, flush };
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

it("cancels oven-on-table Sit, converts the ray to local pixels, and dedupes", () => {
  const { placeOnTable, flush } = handlers();
  const interact = defined(game.interact.mock.calls[0], "oven interaction")[0];
  const event = {
    cancel: false,
    target: {
      id: "table",
      typeId: CAMP_TABLE_TYPE,
      location: { x: 4, y: 60, z: 5 },
      getRotation: () => ({ y: 90 }),
    },
    itemStack: { typeId: DUTCH_OVEN_ITEM },
    player: {
      id: "p",
      selectedSlotIndex: 2,
      getHeadLocation: () => ({ x: 4, y: 62, z: 5 + 7.5 / 16 }),
      getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
    },
  };
  interact(event);
  interact(event);
  expect(event.cancel).toBe(true);
  expect(placeOnTable).not.toHaveBeenCalled();
  flush();
  expect(placeOnTable).toHaveBeenCalledOnce();
  const command = defined(placeOnTable.mock.calls[0], "table placement")[0];
  expect(command).toMatchObject({ player: "p", table: "table", slot: 2 });
  expect(command.aim.x).toBeCloseTo(7.5);
  expect(command.aim.z).toBeCloseTo(0);
  game.tick++;
  event.player.getViewDirection = () => ({ x: 0, y: 1, z: 0 });
  interact(event);
  flush();
  expect(placeOnTable).toHaveBeenLastCalledWith({
    player: "p",
    table: "table",
    slot: 2,
    aim: undefined,
  });
});
it("shows the hint for each table top refusal and nothing otherwise", () => {
  const { placeOnTable, flush } = handlers();
  const interact = defined(game.interact.mock.calls[0], "oven interaction")[0];
  for (const [outcome, hint] of [
    ["full", "yasu_ride.hint.camp_table_full"],
    ["overlap", "yasu_ride.hint.camp_table_overlap"],
    ["tooBig", "yasu_ride.hint.camp_table_too_big"],
    ["refused", undefined],
    ["placed", undefined],
  ] as const) {
    game.tick++;
    placeOnTable.mockReturnValue(outcome);
    const setActionBar = vi.fn();
    interact({
      cancel: false,
      target: {
        id: "table",
        typeId: CAMP_TABLE_TYPE,
        location: { x: 4, y: 60, z: 5 },
        getRotation: () => ({ y: 0 }),
      },
      itemStack: { typeId: DUTCH_OVEN_ITEM },
      player: {
        id: "p",
        isValid: true,
        selectedSlotIndex: 0,
        getHeadLocation: () => ({ x: 4, y: 62, z: 5 }),
        getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
        onScreenDisplay: { setActionBar },
      },
    });
    flush();
    if (hint)
      expect(setActionBar).toHaveBeenCalledExactlyOnceWith({ translate: hint });
    else expect(setActionBar).not.toHaveBeenCalled();
  }
});
it("leaves table Sit alone for other items and empty hands", () => {
  const { placeOnTable, flush } = handlers();
  const interact = defined(game.interact.mock.calls[0], "oven interaction")[0];
  for (const itemStack of [undefined, { typeId: "minecraft:stick" }]) {
    const event = {
      cancel: false,
      target: { typeId: CAMP_TABLE_TYPE },
      itemStack,
    };
    interact(event);
    expect(event.cancel).toBe(false);
  }
  flush();
  expect(placeOnTable).not.toHaveBeenCalled();
});
it("accepts only server table test requests with one valid spot or a local point", () => {
  const { placeOnTable } = handlers();
  const script = defined(game.script.mock.calls[0], "oven script")[0];
  for (const message of [
    "table",
    "table -1",
    "table 2",
    "table 0 extra",
    "table NaN",
    "table 1 2 3",
    "table 1e2 0",
    "table Infinity 0",
    "table 1.",
  ])
    script({
      id: TEST_DUTCH_OVEN_ON_TABLE_EVENT,
      message,
      sourceType: "Server",
    });
  script({
    id: TEST_DUTCH_OVEN_ON_TABLE_EVENT,
    message: "table 0",
    sourceType: "Entity",
  });
  expect(placeOnTable).not.toHaveBeenCalled();
  for (const message of ["table 0", "table 1", " table  -3.25 4 "])
    script({
      id: TEST_DUTCH_OVEN_ON_TABLE_EVENT,
      message,
      sourceType: "Server",
    });
  expect(placeOnTable.mock.calls.map((call) => call[0])).toEqual([
    { table: "table", slot: 0, aim: { x: -7.5, z: 0 } },
    { table: "table", slot: 0, aim: { x: 7.5, z: 0 } },
    { table: "table", slot: 0, aim: { x: -3.25, z: 4 } },
  ]);
});
it("writes a host marker only for server requests naming an oven", () => {
  handlers();
  const script = defined(game.script.mock.calls[0], "oven script")[0];
  const oven = {
    typeId: DUTCH_OVEN_TYPE,
    setDynamicProperty: vi.fn(),
    setProperty: vi.fn(),
    triggerEvent: vi.fn(),
    clearVelocity: vi.fn(),
  };
  game.entity.mockImplementation((id: string) =>
    id === "oven" ? oven : { ...oven, typeId: CAMP_TABLE_TYPE },
  );
  for (const [message, sourceType] of [
    ["oven camp_table:t:0", "Entity"],
    ["oven", "Server"],
    ["oven camp_table:t:0 extra", "Server"],
    ["table camp_table:t:0", "Server"],
  ])
    script({ id: TEST_DUTCH_OVEN_HOST_EVENT, message, sourceType });
  expect(oven.setDynamicProperty).not.toHaveBeenCalled();
  script({
    id: TEST_DUTCH_OVEN_HOST_EVENT,
    message: "oven camp_table:t:0",
    sourceType: "Server",
  });
  expect(oven.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
    DUTCH_OVEN_HOST_PROPERTY,
    "camp_table:t:0",
  );
  expect(oven.setProperty).toHaveBeenCalledWith(
    DUTCH_OVEN_SIMMERING_PROPERTY,
    false,
  );
  expect(oven.triggerEvent).toHaveBeenCalledWith(DUTCH_OVEN_HOSTED_EVENT);
});
it("reads every oven hosted by this table, at its point or its legacy spot", () => {
  const hosts = [
    "camp_table:table:@3.5,-2",
    "camp_table:table:1",
    "camp_table:other:0",
    "camp_table:other:@0,0",
    "fire_pit:table:0",
    "",
  ];
  const table = {
    isValid: true,
    typeId: CAMP_TABLE_TYPE,
    location: { x: 1, y: 2, z: 3 },
    getRotation: () => ({ y: 90 }),
    dimension: {
      id: "overworld",
      getEntities: ({ type }: { type: string }) =>
        type === DUTCH_OVEN_TYPE
          ? hosts.map((host) => ({ getDynamicProperty: () => host }))
          : [],
    },
  };
  game.entity.mockReturnValue(table);
  const ovens = new BedrockDutchOvenWorld({ isVehicleSpace: () => false });
  expect(ovens.table("table")).toEqual({
    dimension: "overworld",
    at: table.location,
    yaw: 90,
  });
  const footprint = DUTCH_OVEN_FOOTPRINT_PX;
  expect(ovens.itemsOnTable("table")).toEqual([
    { at: { x: 3.5, z: -2 }, footprint },
    { at: { x: 7.5, z: 0 }, footprint },
  ]);
  hosts.shift();
  expect(ovens.itemsOnTable("table")).toEqual([
    { at: { x: 7.5, z: 0 }, footprint },
  ]);
  table.isValid = false;
  expect(ovens.table("table")).toBeUndefined();
  expect(ovens.itemsOnTable("table")).toEqual([]);
});
