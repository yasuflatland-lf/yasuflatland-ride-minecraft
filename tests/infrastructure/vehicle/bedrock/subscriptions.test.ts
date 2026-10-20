import {
  type BlockCustomComponent,
  type EntityLoadAfterEvent,
  type EntitySpawnAfterEvent,
  type ItemUseAfterEvent,
  type PlayerInteractWithBlockBeforeEvent,
  type PlayerSpawnAfterEvent,
  type ScriptEventCommandMessageAfterEvent,
  type StartupEvent,
  system,
  world,
} from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { PlaceVehicle } from "../../../../src/application/vehicle/placeVehicle";
import type { PlacementWorld } from "../../../../src/application/vehicle/ports";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import type { VehicleRepository } from "../../../../src/domain/vehicle/vehicleRepository";
import {
  CAMPER_DOOR_COMPONENT,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  ENTITY_TYPE,
  ITEM_TYPE,
  OWNER_PROPERTY,
  TEST_INPUT_EVENT,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { registerSubscriptions } from "../../../../src/infrastructure/vehicle/bedrock/subscriptions";
import { TestInputStore } from "../../../../src/infrastructure/vehicle/testInput/testInputStore";
import { defined } from "../../../support/defined";

const game = vi.hoisted(() => ({
  before:
    vi.fn<
      (handler: (ev: PlayerInteractWithBlockBeforeEvent) => void) => void
    >(),
  use: vi.fn<(handler: (ev: ItemUseAfterEvent) => void) => void>(),
  run: vi.fn<(callback: () => void) => void>(),
  startup: vi.fn<(handler: (ev: StartupEvent) => void) => void>(),
  currentTick: 10,
}));
vi.mock("@minecraft/server", () => {
  const signal = () => ({ subscribe: vi.fn() });
  return {
    Direction: {
      Up: "Up",
      Down: "Down",
      North: "North",
      South: "South",
      East: "East",
      West: "West",
    },
    GameMode: { Creative: "Creative" },
    EntityInitializationCause: { Loaded: "Loaded", Spawned: "Spawned" },
    ScriptEventSource: { Server: "Server", Entity: "Entity" },
    Player: class {},
    system: {
      get currentTick() {
        return game.currentTick;
      },
      run: game.run,
      runInterval: vi.fn(),
      beforeEvents: { startup: { subscribe: game.startup } },
      afterEvents: { scriptEventReceive: signal() },
    },
    world: {
      beforeEvents: {
        playerInteractWithBlock: { subscribe: game.before },
        playerInteractWithEntity: signal(),
      },
      afterEvents: {
        itemUse: { subscribe: game.use },
        entityLoad: signal(),
        entitySpawn: signal(),
        playerSpawn: signal(),
        entityHitEntity: signal(),
      },
    },
  };
});

const FACES = ["Up", "Down", "North", "South", "East", "West"] as const;
type At = { x: number; y: number; z: number };

// The clicked block sits at y 5 with `depth` water cells above it at every x/z,
// unless `water` says otherwise. The view ray hits the water cell at y 7.
function fixture(
  typeId = ITEM_TYPE.sportsboat,
  depth = 3,
  water = (at: At) => at.y > 5 && at.y <= 5 + depth,
) {
  const dimension = {
    id: "overworld",
    getBlock: vi.fn((at: At) => ({
      typeId: water(at) ? "minecraft:water" : "minecraft:air",
      isWaterlogged: false,
    })),
  };
  const block = { dimension, location: { x: 2, y: 5, z: 3 } };
  const rayBlock = { dimension, location: { x: 2, y: 7, z: 3 } };
  const player = {
    id: "player",
    selectedSlotIndex: 2,
    getRotation: () => ({ y: -90 }),
    getGameMode: () => "Survival",
    getBlockFromViewDirection: vi.fn<
      () => { block: typeof block; face: string } | undefined
    >(() => ({ block: rayBlock, face: "Up" })),
  };
  const waterDimensions: string[] = [];
  const notUsed = (): never => {
    throw new Error("not used by cellFor or placesOnWater");
  };
  const placementWorld: PlacementWorld = {
    isAir: notUsed,
    isWaterAt: (dimensionId, at) => {
      waterDimensions.push(dimensionId);
      return water(at);
    },
    spawnVehicle: notUsed,
    consumeVehicleItem: notUsed,
  };
  // cellFor and placesOnWater never touch the repository.
  const placement = new PlaceVehicle(placementWorld, {} as VehicleRepository);
  const place = {
    execute: vi.fn(),
    cellFor: placement.cellFor.bind(placement),
    placesOnWater: placement.placesOnWater.bind(placement),
  };
  registerSubscriptions(
    { place } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
    () => undefined,
  );
  const before = game.before.mock.calls.at(-1)?.[0];
  const use = game.use.mock.calls.at(-1)?.[0];
  if (!before || !use) throw new Error("subscriptions missing");
  game.run.mockClear();
  const event = {
    isFirstEvent: true,
    itemStack: { typeId },
    blockFace: "Up",
    cancel: false,
    block,
    player,
  };
  return {
    event,
    player,
    place,
    waterDimensions,
    dimension,
    interact: () =>
      before(event as unknown as PlayerInteractWithBlockBeforeEvent),
    use: () =>
      use({
        itemStack: { typeId },
        source: player,
      } as unknown as ItemUseAfterEvent),
    // system.run callbacks run on the next tick.
    nextTick: () => {
      game.currentTick++;
      for (const [callback] of game.run.mock.calls) callback();
      game.run.mockClear();
    },
  };
}

const boatAt = (blockLocation: At) => ({
  kind: "sportsboat",
  playerId: "player",
  dimensionId: "overworld",
  blockLocation,
  yaw: -90,
  creative: false,
  slot: 2,
});

beforeEach(() => {
  vi.clearAllMocks();
  game.currentTick = 10;
});

it("places the boat at the water surface on the next tick from the bed's top face, and not from a dry side or bottom face", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACES),
      fc.integer({ min: 0, max: 16 }),
      (face, depth) => {
        const f = fixture(ITEM_TYPE.sportsboat, depth);
        f.event.blockFace = face;
        f.interact();
        expect(new Set(f.waterDimensions)).toEqual(new Set(["overworld"]));
        expect(f.event.cancel).toBe(face === "Up");
        expect(f.place.execute).not.toHaveBeenCalled();
        f.nextTick();
        if (face === "Up")
          expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
            boatAt({ x: 2, y: 5 + depth, z: 3 }),
          );
        else expect(f.place.execute).not.toHaveBeenCalled();
      },
    ),
  );
});

it("places the boat on the water beside a shore whose side is clicked", () => {
  // Water fills x 3 from y 4 to y 6, beside the clicked block's east face.
  const f = fixture(
    ITEM_TYPE.sportsboat,
    0,
    (at) => at.x === 3 && at.y >= 4 && at.y <= 6,
  );
  f.event.blockFace = "East";
  f.interact();
  expect(f.event.cancel).toBe(true);
  f.nextTick();
  expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
    boatAt({ x: 3, y: 6, z: 3 }),
  );
});

it("keeps SUV placement restricted to first events on the top face without climbing", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FACES), fc.boolean(), (face, first) => {
      const f = fixture(ITEM_TYPE.suv);
      f.event.blockFace = face;
      f.event.isFirstEvent = first;
      f.interact();
      f.use();
      f.nextTick();
      expect(f.event.cancel).toBe(first && face === "Up");
      expect(f.place.execute).toHaveBeenCalledTimes(
        first && face === "Up" ? 1 : 0,
      );
      if (first && face === "Up")
        expect(f.place.execute.mock.calls[0]?.[0].blockLocation).toEqual({
          x: 2,
          y: 5,
          z: 3,
        });
      expect(f.player.getBlockFromViewDirection).not.toHaveBeenCalled();
    }),
  );
});

it("places one boat when one tap fires both the interaction and itemUse in the same tick", () => {
  fc.assert(
    fc.property(fc.boolean(), (interactFirst) => {
      const f = fixture();
      if (interactFirst) {
        f.interact();
        f.use();
      } else {
        f.use();
        f.interact();
      }
      f.use();
      f.nextTick();
      expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
        boatAt({ x: 2, y: 8, z: 3 }),
      );
      expect(f.player.getBlockFromViewDirection).toHaveBeenCalledWith({
        includeLiquidBlocks: true,
        includePassableBlocks: true,
        maxDistance: 12,
      });
      f.player.id = "other";
      f.use();
      expect(f.place.execute).toHaveBeenCalledTimes(2);
      f.nextTick();
      f.use();
      expect(f.place.execute).toHaveBeenCalledTimes(3);
    }),
  );
});

it("ignores a repeated boat interaction", () => {
  const f = fixture();
  f.event.isFirstEvent = false;
  f.interact();
  f.nextTick();
  expect(f.event.cancel).toBe(false);
  expect(f.place.execute).not.toHaveBeenCalled();
});

it("places nothing from an itemUse ray that misses or hits land, and leaves that tick's request to the interaction", () => {
  fc.assert(
    fc.property(fc.boolean(), (miss) => {
      const f = fixture();
      f.player.getBlockFromViewDirection.mockReturnValue(
        miss
          ? undefined
          : {
              block: { ...f.event.block, location: { x: 2, y: 2, z: 3 } },
              face: "Up",
            },
      );
      f.use();
      expect(f.place.execute).not.toHaveBeenCalled();
      f.interact();
      f.nextTick();
      expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
        boatAt({ x: 2, y: 8, z: 3 }),
      );
    }),
  );
});

it("limits deferred placement and itemUse to one placement on their execution tick", () => {
  fc.assert(
    fc.property(fc.boolean(), (flushFirst) => {
      const f = fixture();
      f.interact();
      if (flushFirst) {
        f.nextTick();
        f.use();
      } else {
        game.currentTick++;
        f.use();
        game.currentTick--;
        f.nextTick();
      }
      expect(f.place.execute).toHaveBeenCalledTimes(1);
    }),
  );
});

it("removes an orphan deck seat that loads with a chunk, but not one that is just spawned", () => {
  const limit = { start: vi.fn(), found: vi.fn(), spawned: vi.fn() };
  registerSubscriptions(
    { limit } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
    () => undefined,
  );
  const spawn = vi
    .mocked(world.afterEvents.entitySpawn.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!spawn) throw new Error("entitySpawn not subscribed");
  const seat = () => ({
    typeId: DECK_SEAT_TYPE,
    isValid: true,
    location: { x: 0, y: 0, z: 0 },
    dimension: { getEntities: () => [] },
    getDynamicProperty: (key: string) =>
      key === DECK_SEAT_OF_PROPERTY ? "gone" : undefined,
    remove: vi.fn(),
  });
  const loaded = seat();
  const spawned = seat();
  spawn({
    entity: loaded,
    cause: "Loaded",
  } as unknown as EntitySpawnAfterEvent);
  spawn({
    entity: spawned,
    cause: "Spawned",
  } as unknown as EntitySpawnAfterEvent);
  expect(loaded.remove).toHaveBeenCalledOnce();
  expect(spawned.remove).not.toHaveBeenCalled();
  expect(limit.found).not.toHaveBeenCalled();
  expect(limit.spawned).not.toHaveBeenCalled();
});

it("passes fleet metadata on spawn and load and skips invalid or unrelated entities", () => {
  const limit = { start: vi.fn(), found: vi.fn(), spawned: vi.fn() };
  registerSubscriptions(
    { limit } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
    () => undefined,
  );
  const spawn = vi
    .mocked(world.afterEvents.entitySpawn.subscribe)
    .mock.calls.at(-1)?.[0];
  const load = vi
    .mocked(world.afterEvents.entityLoad.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!spawn || !load) throw new Error("fleet events not subscribed");
  const entity = {
    id: "boat",
    typeId: ENTITY_TYPE.sportsboat,
    isValid: true,
    getDynamicProperty: (key: string) =>
      key === OWNER_PROPERTY ? "player" : undefined,
  };
  const entry = { id: "boat", kind: "sportsboat", owner: "player" };
  spawn({ entity, cause: "Spawned" } as unknown as EntitySpawnAfterEvent);
  expect(limit.spawned).toHaveBeenCalledExactlyOnceWith(entry);
  spawn({ entity, cause: "Loaded" } as unknown as EntitySpawnAfterEvent);
  load({ entity } as unknown as EntityLoadAfterEvent);
  expect(limit.found.mock.calls).toEqual([[[entry]], [[entry]]]);
  for (const skipped of [
    { ...entity, isValid: false },
    { ...entity, typeId: "minecraft:cow" },
  ]) {
    spawn({
      entity: skipped,
      cause: "Spawned",
    } as unknown as EntitySpawnAfterEvent);
    load({ entity: skipped } as unknown as EntityLoadAfterEvent);
  }
  expect(limit.spawned).toHaveBeenCalledTimes(1);
  expect(limit.found).toHaveBeenCalledTimes(2);
});

it("registers door interactions during startup and dispatches only owned doors", () => {
  const door = { execute: vi.fn() };
  const owner = vi.fn<(dimensionId: string, cell: At) => string | undefined>();
  registerSubscriptions(
    { door } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
    owner,
  );
  const startup = game.startup.mock.calls.at(-1)?.[0];
  if (!startup) throw new Error("startup not subscribed synchronously");
  const registerCustomComponent =
    vi.fn<(name: string, component: BlockCustomComponent) => void>();
  startup({
    blockComponentRegistry: { registerCustomComponent },
  } as unknown as StartupEvent);
  expect(registerCustomComponent.mock.calls[0]?.[0]).toBe(
    CAMPER_DOOR_COMPONENT,
  );
  const interact = registerCustomComponent.mock.calls[0]?.[1].onPlayerInteract;
  if (!interact) throw new Error("door interaction missing");
  const cell = { x: 1, y: 64, z: 2 };
  const event = {
    dimension: { id: "overworld" },
    block: { location: cell },
  } as Parameters<typeof interact>[0];
  interact(event, { params: undefined });
  expect(owner).toHaveBeenCalledExactlyOnceWith("overworld", cell);
  expect(door.execute).not.toHaveBeenCalled();
  owner.mockReturnValue("camper");
  interact(event, { params: undefined });
  expect(door.execute).toHaveBeenCalledExactlyOnceWith({ vehicleId: "camper" });
});

it("checks the hints every hint interval, after the drive on the same tick (ADR 0086)", () => {
  const drive = { execute: vi.fn() };
  const hints = { execute: vi.fn() };
  registerSubscriptions(
    { drive, hints } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
    () => undefined,
  );
  const intervals = vi.mocked(system.runInterval).mock.calls;
  expect(intervals.map(([, ticks]) => ticks)).toEqual([
    1,
    SPEC.hintCheckInterval,
  ]);
  for (const [callback] of intervals) callback();
  expect(drive.execute).toHaveBeenCalledWith(game.currentTick);
  expect(hints.execute).toHaveBeenCalledWith(game.currentTick);
  expect(drive.execute.mock.invocationCallOrder[0]).toBeLessThan(
    defined(hints.execute.mock.invocationCallOrder[0], "hints call"),
  );
});

it("gives the starter vehicle only on a player's initial spawn", () => {
  const starter = { execute: vi.fn() };
  registerSubscriptions(
    { starter } as unknown as Parameters<typeof registerSubscriptions>[0],
    new TestInputStore(),
    () => undefined,
  );
  const spawn = vi
    .mocked(world.afterEvents.playerSpawn.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!spawn) throw new Error("playerSpawn not subscribed");
  const player = { id: "player" };
  spawn({ player, initialSpawn: false } as unknown as PlayerSpawnAfterEvent);
  expect(starter.execute).not.toHaveBeenCalled();
  spawn({ player, initialSpawn: true } as unknown as PlayerSpawnAfterEvent);
  expect(starter.execute).toHaveBeenCalledExactlyOnceWith("player");
});

it("stores and clears test input only from server script events", () => {
  const inputs = new TestInputStore();
  registerSubscriptions(
    {} as unknown as Parameters<typeof registerSubscriptions>[0],
    inputs,
    () => undefined,
  );
  const receive = vi
    .mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!receive) throw new Error("scriptEventReceive not subscribed");
  const send = (
    message: string,
    sourceType = "Server",
    id = TEST_INPUT_EVENT,
  ) =>
    receive({
      id,
      message,
      sourceType,
    } as unknown as ScriptEventCommandMessageAfterEvent);
  send("suv,1,0,1", "Entity");
  send("suv,1,0,1", "Server", "minecraft:other");
  expect(inputs.get("suv")).toBeUndefined();
  send("suv,1,-1,1");
  expect(inputs.get("suv")).toEqual({ moveX: 1, moveY: -1, jump: true });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  send("suv,bad");
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
  expect(inputs.get("suv")).toEqual({ moveX: 1, moveY: -1, jump: true });
  send("suv,clear");
  expect(inputs.get("suv")).toBeUndefined();
});
