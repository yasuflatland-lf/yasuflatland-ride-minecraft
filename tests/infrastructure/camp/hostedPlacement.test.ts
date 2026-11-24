import type { Entity, Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import { GasLanternActions } from "../../../src/application/camp/gasLantern";
import { HostedItemsGuard } from "../../../src/application/shared/hostedItemsGuard";
import type { TopHostWorld } from "../../../src/application/shared/placeOnTop";
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
  TEST_DUTCH_OVEN_ON_TOP_EVENT,
  TEST_GAS_LANTERN_ON_TOP_EVENT,
} from "../../../src/infrastructure/camp/identifiers";
import { registerTestDutchOven } from "../../../src/infrastructure/camp/testHooks/dutchOven";
import { registerTestGasLantern } from "../../../src/infrastructure/camp/testHooks/gasLantern";
import {
  TopHostRegistry,
  type TopHostType,
} from "../../../src/infrastructure/shared/tableTop/registry";

const game = vi.hoisted(() => ({
  tick: 10,
  run: vi.fn(),
  interact: vi.fn(),
  block: vi.fn(),
  script: vi.fn(),
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
  ScriptEventSource: { Server: "Server" },
  world: {
    getEntity: game.getEntity,
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
    afterEvents: { scriptEventReceive: { subscribe: game.script } },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  game.tick = 10;
});

const top = {
  hostType: "test_top",
  entityTypeId: "test:host",
  surface: {
    half: { halfX: 16, halfZ: 16 },
    topPx: 16,
    limit: 2,
    clearanceBase: 0,
  },
  refusalHints: {
    full: "test.full",
    overlap: "test.overlap",
    tooBig: "test.big",
  },
} satisfies Omit<TopHostType, "isTopNow">;

function placementWorld(kind: "lantern" | "oven") {
  return {
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
  } satisfies TopHostWorld & Pick<BedrockGasLanternWorld, "relayLoaded">;
}

it.each(["lantern", "oven"] as const)(
  "places a %s on a registered non-camp host through entity interactions once per tick",
  (kind) => {
    const registry = new TopHostRegistry();
    let available = true;
    registry.registerHost({ ...top, isTopNow: () => available });
    const world = placementWorld(kind);
    const placeHostedOnTop =
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
    let held = "minecraft:stick";
    let headX = 0;
    const getComponent = vi.fn(() => ({
      container: { getItem: () => ({ typeId: held }) },
    }));
    const player = {
      id: "player",
      selectedSlotIndex: 3,
      getComponent,
      getHeadLocation: () => ({ x: headX, y: 62, z: 0 }),
      getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
    } as unknown as Player;
    const host = {
      id: "host",
      typeId: top.entityTypeId,
      location: { x: 0, y: 60, z: 0 },
      getRotation: () => ({ y: 0 }),
    } as unknown as Entity;
    const event = {
      player,
      target: host,
      itemStack: { typeId: item },
      cancel: false,
    };
    const interact = game.interact.mock.calls[0]?.[0];
    interact(event);
    expect(event.cancel).toBe(true);
    event.cancel = false;
    interact(event);
    expect(event.cancel).toBe(true);
    expect(getComponent).not.toHaveBeenCalled();
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
    held = item;
    expect(placeHostedOnTop(player, host)).toBe(true);
    expect(game.run).toHaveBeenCalledOnce();
    expect(world.spawnHosted).not.toHaveBeenCalled();
    player.selectedSlotIndex = 5;
    headX = 0.25;
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
    const emptyHand = { ...event, cancel: false, itemStack: undefined };
    interact(emptyHand);
    expect(emptyHand.cancel).toBe(false);
    expect(game.run).toHaveBeenCalledOnce();
    expect(placeHostedOnTop(player, host)).toBe(true);
    event.cancel = false;
    interact(event);
    expect(event.cancel).toBe(true);
    expect(game.run).toHaveBeenCalledTimes(2);
    available = false;
    event.cancel = false;
    interact(event);
    expect(event.cancel).toBe(false);
    available = true;
    held = "minecraft:stick";
    event.itemStack.typeId = held;
    event.cancel = false;
    interact(event);
    expect(event.cancel).toBe(false);
    expect(game.run).toHaveBeenCalledTimes(2);
  },
);

it.each(["lantern", "oven"] as const)(
  "places a %s without payment only for valid server tabletop requests",
  (kind) => {
    const registry = new TopHostRegistry();
    registry.registerHost({ ...top, isTopNow: () => true });
    game.getEntity.mockImplementation((id: string) =>
      id === "host" ? { isValid: true, typeId: top.entityTypeId } : undefined,
    );
    const world = placementWorld(kind);
    if (kind === "lantern") {
      registerTestGasLantern(
        new GasLanternActions(
          world as unknown as ConstructorParameters<
            typeof GasLanternActions
          >[0],
          GAS_LANTERN_ON_TOP,
        ),
        registry,
      );
    } else {
      registerTestDutchOven(
        new DutchOvenActions(
          world as unknown as ConstructorParameters<typeof DutchOvenActions>[0],
          DUTCH_OVEN_ON_TOP,
        ),
        registry,
      );
    }
    const id =
      kind === "lantern"
        ? TEST_GAS_LANTERN_ON_TOP_EVENT
        : TEST_DUTCH_OVEN_ON_TOP_EVENT;
    const script = game.script.mock.calls[0]?.[0];
    script({ id, sourceType: "Entity", message: "test_top host 1 -2" });
    for (const message of [
      "other_top host 1 -2",
      "test_top missing 1 -2",
      "test_top host 1",
    ]) {
      script({ id, sourceType: "Server", message });
    }
    expect(world.spawnHosted).not.toHaveBeenCalled();
    script({ id, sourceType: "Server", message: " test_top  host  1 -2 " });
    expect(world.spawnHosted).toHaveBeenCalledExactlyOnceWith(
      kind === "lantern" ? "gas_lantern" : "dutch_oven",
      "overworld",
      { x: 1 / 16, y: 61, z: -2 / 16 },
      0,
      "test_top:host:@1,-2",
    );
    expect(world.consumeItem).not.toHaveBeenCalled();
    expect(game.run).not.toHaveBeenCalled();
  },
);
