import { beforeEach, expect, it, vi } from "vitest";
import { GiveStarterItem } from "../../../src/application/shared/giveStarterItem";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  ROOF_TENT_ITEM,
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
} from "../../../src/infrastructure/camp/identifiers";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../../../src/infrastructure/shared/starterItem";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), subscribe: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: {
    getEntity: game.getEntity,
    afterEvents: { playerSpawn: { subscribe: game.subscribe } },
  },
  GameMode: { Creative: "Creative", Survival: "Survival" },
  ItemStack: class {
    constructor(
      readonly typeId: string,
      readonly amount: number,
    ) {}
  },
}));
beforeEach(() => vi.resetAllMocks());
const id = asPlayerId("p");

it("reads the player flag, gives one item with overflow dropped, and marks receipt", () => {
  const flags = new Map<string, unknown>();
  const spawnItem = vi.fn();
  const addItem = vi.fn((item) => item);
  const player = {
    typeId: "minecraft:player",
    isValid: true,
    getGameMode: vi.fn(() => "Survival"),
    getDynamicProperty: vi.fn((key) => flags.get(key)),
    setDynamicProperty: vi.fn((key, value) => flags.set(key, value)),
    getComponent: vi.fn(() => ({ container: { addItem } })),
    dimension: { spawnItem },
    location: { x: 1, y: 64, z: 2 },
  };
  game.getEntity.mockReturnValue(player);
  const world = new BedrockStarterItemWorld(
    ROOF_TENT_ITEM,
    ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  );
  expect(world.received(id)).toBe(false);
  expect(world.isCreative(id)).toBe(false);
  expect(new GiveStarterItem(world).execute(id)).toBe(true);
  expect(addItem).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ typeId: ROOF_TENT_ITEM, amount: 1 }),
  );
  expect(spawnItem).toHaveBeenCalledExactlyOnceWith(
    addItem.mock.calls[0]?.[0],
    player.location,
  );
  expect(player.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
    ROOF_TENT_STARTER_RECEIVED_PROPERTY,
    true,
  );
  expect(world.received(id)).toBe(true);
  player.getGameMode.mockReturnValue("Creative");
  expect(world.isCreative(id)).toBe(true);
});

it("returns undefined for a missing player and safely skips adapter writes", () => {
  const world = new BedrockStarterItemWorld(
    ROOF_TENT_ITEM,
    ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  );
  expect(world.received(id)).toBeUndefined();
  expect(world.isCreative(id)).toBe(false);
  expect(() => {
    world.give(id);
    world.markReceived(id);
  }).not.toThrow();
});

it("runs the starter on joins but not respawns", () => {
  const starter = new GiveStarterItem(
    new BedrockStarterItemWorld(
      ROOF_TENT_ITEM,
      ROOF_TENT_STARTER_RECEIVED_PROPERTY,
    ),
  );
  const execute = vi.spyOn(starter, "execute").mockReturnValue(false);
  registerStarterItem(starter);
  expect(game.subscribe).toHaveBeenCalledTimes(1);
  const onSpawn = game.subscribe.mock.calls[0]?.[0];
  onSpawn({ initialSpawn: false, player: { id: "p" } });
  expect(execute).not.toHaveBeenCalled();
  onSpawn({ initialSpawn: true, player: { id: "p" } });
  expect(execute).toHaveBeenCalledExactlyOnceWith(id);
});
