import type {
  EntityHitEntityAfterEvent,
  ScriptEventCommandMessageAfterEvent,
} from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GasLanternActions } from "../../../src/application/camp/gasLantern";
import type { BedrockGasLanternWorld } from "../../../src/infrastructure/camp/bedrock/bedrockGasLanternWorld";
import { registerGasLantern } from "../../../src/infrastructure/camp/bedrock/handlers/gasLantern";
import {
  GAS_LANTERN_TYPE,
  TEST_GAS_LANTERN_EVENT,
  TEST_GAS_LANTERN_HIT_EVENT,
} from "../../../src/infrastructure/camp/identifiers";
import { HEADLIGHT_SWITCH_TYPE } from "../../../src/infrastructure/shared/identifiers";
import { defined } from "../../support/defined";

const game = vi.hoisted(() => ({
  interval: vi.fn(),
  hit: vi.fn<(handler: (ev: EntityHitEntityAfterEvent) => void) => void>(),
  script:
    vi.fn<
      (handler: (ev: ScriptEventCommandMessageAfterEvent) => void) => void
    >(),
  entity: { id: "lantern", typeId: "yasu_ride:gas_lantern" },
  Player: class {
    id = "player";
    selectedSlotIndex = 0;
    held: string | undefined;
    getComponent() {
      return {
        container: {
          getItem: () => (this.held ? { typeId: this.held } : undefined),
        },
      };
    }
  },
}));
vi.mock("@minecraft/server", () => ({
  Player: game.Player,
  Direction: { Up: "Up" },
  ScriptEventSource: { Server: "Server" },
  world: {
    beforeEvents: { playerInteractWithBlock: { subscribe: vi.fn() } },
    afterEvents: { entityHitEntity: { subscribe: game.hit } },
    getEntity: (id: string) =>
      id === game.entity.id ? game.entity : undefined,
  },
  system: {
    currentTick: 42,
    runInterval: game.interval,
    afterEvents: { scriptEventReceive: { subscribe: game.script } },
  },
}));
beforeEach(() => vi.clearAllMocks());

function fixture() {
  const world = {
    isAir: () => true,
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    isCreative: () => false,
    consumeItem: () => true,
    hasGasLanternNear: () => false,
    spawnGasLantern: vi.fn(),
    isLit: () => false,
    setLit: vi.fn(),
    relayLight: vi.fn(),
    clearLight: vi.fn(),
    relayLoaded: vi.fn(),
    dropItem: vi.fn(),
    removeGasLantern: vi.fn(),
    showHitsLeft: vi.fn(),
  };
  registerGasLantern(
    new GasLanternActions(world),
    world as unknown as BedrockGasLanternWorld,
  );
  return world;
}

it("switches on tool hits without hints or progress toward taking back a lantern", () => {
  const world = fixture();
  const hit = defined(game.hit.mock.calls[0]?.[0], "hit handler");
  const player = new game.Player();
  const strike = (typeId = GAS_LANTERN_TYPE, attacker: unknown = player) =>
    hit({
      damagingEntity: attacker,
      hitEntity: { id: "lantern", typeId },
    } as EntityHitEntityAfterEvent);
  for (const held of [
    HEADLIGHT_SWITCH_TYPE,
    undefined,
    HEADLIGHT_SWITCH_TYPE,
    "minecraft:stick",
  ]) {
    player.held = held;
    strike();
  }
  strike("yasu_ride:fire_pit");
  strike(GAS_LANTERN_TYPE, {});
  expect(world.setLit).toHaveBeenCalledExactlyOnceWith("lantern", true);
  expect(world.relayLight).toHaveBeenCalledExactlyOnceWith("lantern", true);
  expect(world.dropItem).not.toHaveBeenCalled();
  expect(world.showHitsLeft.mock.calls).toEqual([
    ["player", 2],
    ["player", 1],
  ]);
  strike();
  expect(world.dropItem).toHaveBeenCalledExactlyOnceWith("lantern");
  expect(world.removeGasLantern).toHaveBeenCalledExactlyOnceWith("lantern");
});

it("accepts the take-back test hook only from the server for a Gas Lantern", () => {
  const world = fixture();
  const script = defined(game.script.mock.calls[0]?.[0], "script handler");
  const send = (
    sourceType: string,
    message = "lantern",
    id = TEST_GAS_LANTERN_HIT_EVENT,
  ) =>
    script({ sourceType, message, id } as ScriptEventCommandMessageAfterEvent);
  send("Entity");
  send("Server", "missing");
  send("Server", "lantern", "yasu_ride:test_fire_pit_hit");
  expect(world.showHitsLeft).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) send("Server");
  expect(world.dropItem).toHaveBeenCalledExactlyOnceWith("lantern");
  expect(world.removeGasLantern).toHaveBeenCalledExactlyOnceWith("lantern");
});

it("shares the hit and server switch cooldown, rejects non-server switches, and schedules relaying", () => {
  const world = fixture();
  const script = defined(game.script.mock.calls[0]?.[0], "script handler");
  script({
    sourceType: "Entity",
    message: "lantern",
    id: TEST_GAS_LANTERN_EVENT,
  } as ScriptEventCommandMessageAfterEvent);
  expect(world.setLit).not.toHaveBeenCalled();
  script({
    sourceType: "Server",
    message: "lantern",
    id: TEST_GAS_LANTERN_EVENT,
  } as ScriptEventCommandMessageAfterEvent);
  const player = new game.Player();
  player.held = HEADLIGHT_SWITCH_TYPE;
  defined(
    game.hit.mock.calls[0]?.[0],
    "hit handler",
  )({
    damagingEntity: player,
    hitEntity: game.entity,
  } as unknown as EntityHitEntityAfterEvent);
  expect(world.setLit).toHaveBeenCalledExactlyOnceWith("lantern", true);
  expect(world.showHitsLeft).not.toHaveBeenCalled();
  expect(game.interval).toHaveBeenCalledWith(expect.any(Function), 20);
  const callback = game.interval.mock.calls[0]?.[0] as () => void;
  callback();
  expect(world.relayLoaded).toHaveBeenCalledOnce();
});
