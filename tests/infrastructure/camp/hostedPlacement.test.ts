import type { Entity, Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import { GasLanternActions } from "../../../src/application/camp/gasLantern";
import { HostedItemsGuard } from "../../../src/application/shared/hostedItemsGuard";
import { asDimensionId } from "../../../src/domain/shared/ids";
import type { BedrockGasLanternWorld } from "../../../src/infrastructure/camp/bedrock/bedrockGasLanternWorld";
import { registerDutchOven } from "../../../src/infrastructure/camp/bedrock/handlers/dutchOven";
import { registerGasLantern } from "../../../src/infrastructure/camp/bedrock/handlers/gasLantern";
import {
  DUTCH_OVEN_ON_TOP,
  GAS_LANTERN_ON_TOP,
} from "../../../src/infrastructure/camp/bedrock/topHosts";
import {
  DUTCH_OVEN_ITEM,
  GAS_LANTERN_ITEM,
} from "../../../src/infrastructure/camp/identifiers";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";

const game = vi.hoisted(() => ({
  tick: 10,
  run: vi.fn(),
  interact: vi.fn(),
  block: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
  world: {
    beforeEvents: {
      playerInteractWithBlock: { subscribe: game.block },
      playerInteractWithEntity: { subscribe: game.interact },
    },
    afterEvents: { entityHitEntity: { subscribe: vi.fn() } },
  },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runInterval: vi.fn(),
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  game.tick = 10;
});

it.each(["lantern", "oven"] as const)(
  "places a %s on a registered non-camp host through entity interactions once per tick",
  (kind) => {
    const registry = new TopHostRegistry();
    let available = true;
    registry.registerHost({
      hostType: "test_top",
      entityTypeId: "test:host",
      surface: {
        half: { halfX: 16, halfZ: 16 },
        topPx: 16,
        limit: 2,
        clearanceBase: 0,
      },
      isTopNow: () => available,
      refusalHints: {
        full: "test.full",
        overlap: "test.overlap",
        tooBig: "test.big",
      },
    });
    const world = {
      isAir: () => true,
      isOwnBlock: () => false,
      isVehicleSpace: () => false,
      isCreative: () => false,
      consumeItem: vi.fn(() => true),
      topHost: vi.fn(() => ({
        dimension: asDimensionId("overworld"),
        at: { x: 0, y: 60, z: 0 },
        yaw: 0,
      })),
      itemsOnTop: () => [],
      refund: vi.fn(),
      spawnHosted: vi.fn(() => kind),
      relayLoaded: vi.fn(),
    };
    kind === "lantern"
      ? registerGasLantern(
          new GasLanternActions(
            world as unknown as ConstructorParameters<
              typeof GasLanternActions
            >[0],
            GAS_LANTERN_ON_TOP,
          ),
          world as unknown as BedrockGasLanternWorld,
          registry,
        )
      : registerDutchOven(
          new DutchOvenActions(
            world as unknown as ConstructorParameters<
              typeof DutchOvenActions
            >[0],
            DUTCH_OVEN_ON_TOP,
          ),
          new HostedItemsGuard([]),
          registry,
        );
    const item = kind === "lantern" ? GAS_LANTERN_ITEM : DUTCH_OVEN_ITEM;
    let held = item;
    const player = {
      id: "player",
      selectedSlotIndex: 3,
      getComponent: () => ({
        container: { getItem: () => ({ typeId: held }) },
      }),
      getHeadLocation: () => ({ x: 0, y: 62, z: 0 }),
      getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
    } as unknown as Player;
    const host = {
      id: "host",
      typeId: "test:host",
      location: { x: 0, y: 60, z: 0 },
      getRotation: () => ({ y: 0 }),
    } as unknown as Entity;
    const event = {
      player,
      target: host,
      itemStack: { typeId: held },
      cancel: false,
    };
    game.interact.mock.calls[0]?.[0](event);
    game.interact.mock.calls[0]?.[0](event);
    const groundPress = {
      player,
      itemStack: event.itemStack,
      block: {
        dimension: { id: "overworld" },
        location: { x: 0, y: 60, z: 0 },
      },
      blockFace: "Up",
      isFirstEvent: true,
      cancel: false,
    };
    game.block.mock.calls[0]?.[0](groundPress);
    expect(groundPress.cancel).toBe(true);
    expect(event.cancel).toBe(true);
    expect(game.run).toHaveBeenCalledOnce();
    expect(world.spawnHosted).not.toHaveBeenCalled();
    game.run.mock.calls[0]?.[0]();
    expect(world.topHost).toHaveBeenCalledWith("test_top", "host");
    expect(world.spawnHosted).toHaveBeenCalledWith(
      kind === "lantern" ? "gas_lantern" : "dutch_oven",
      "overworld",
      { x: 0, y: 61, z: 0 },
      0,
      "test_top:host:@0,0",
    );
    expect(world.consumeItem).toHaveBeenCalledExactlyOnceWith("player", 3);
    game.tick++;
    game.interact.mock.calls[0]?.[0](event);
    expect(game.run).toHaveBeenCalledTimes(2);
    available = false;
    event.cancel = false;
    game.interact.mock.calls[0]?.[0](event);
    expect(event.cancel).toBe(false);
    available = true;
    held = "minecraft:stick";
    event.itemStack.typeId = held;
    event.cancel = false;
    game.interact.mock.calls[0]?.[0](event);
    expect(event.cancel).toBe(false);
    expect(game.run).toHaveBeenCalledTimes(2);
  },
);
