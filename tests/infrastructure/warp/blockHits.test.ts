import { Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockWarpBlockHits } from "../../../src/infrastructure/warp/bedrock/bedrockWarpBlockHits";
import { registerWarpBlockHits } from "../../../src/infrastructure/warp/handlers/blockHits";
import { WARP_BLOCK_TYPE } from "../../../src/infrastructure/warp/identifiers";
import { WARP_MESSAGE } from "../../../src/infrastructure/warp/messages";

const game = vi.hoisted(() => ({
  hit: vi.fn(),
  beforeBreak: vi.fn(),
  run: vi.fn(),
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  tick: 0,
}));
vi.mock("@minecraft/server", () => ({
  Player: class {},
  GameMode: { Creative: "Creative" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
  system: {
    run: game.run,
    get currentTick() {
      return game.tick;
    },
  },
  world: {
    getEntity: game.getEntity,
    getDimension: game.getDimension,
    afterEvents: { entityHitBlock: { subscribe: game.hit } },
    beforeEvents: { playerBreakBlock: { subscribe: game.beforeBreak } },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  game.tick = 10;
});
function fixture() {
  const dimension = {
    id: "minecraft:overworld",
    getBlock: vi.fn(),
    spawnItem: vi.fn(),
  };
  const block = {
    typeId: WARP_BLOCK_TYPE,
    dimension,
    location: { x: 1, y: 64, z: -2 },
    setType: vi.fn(),
  };
  const addItem = vi.fn();
  const player = {
    id: "player",
    typeId: "minecraft:player",
    isValid: true,
    dimension,
    location: block.location,
    getGameMode: () => "Creative",
    getComponent: () => ({ container: { addItem } }),
    onScreenDisplay: { setActionBar: vi.fn() },
  };
  Object.setPrototypeOf(player, Player.prototype);
  game.getEntity.mockReturnValue(player);
  game.getDimension.mockReturnValue(dimension);
  dimension.getBlock.mockReturnValue(block);
  return { player, block, dimension, addItem };
}
it("cancels creative breaks, defers hits and coalesces both paths once per player per tick", () => {
  const f = fixture();
  const useCase = { run: vi.fn() };
  registerWarpBlockHits(useCase);
  const event = { player: f.player, block: f.block, cancel: false };
  game.beforeBreak.mock.calls[0]?.[0](event);
  game.hit.mock.calls[0]?.[0]({ damagingEntity: f.player, hitBlock: f.block });
  expect(event.cancel).toBe(true);
  expect(game.run).toHaveBeenCalledOnce();
  expect(useCase.run).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  expect(useCase.run).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    dimension: f.dimension.id,
    cell: f.block.location,
    now: 10,
  });
  game.tick++;
  game.hit.mock.calls[0]?.[0]({ damagingEntity: f.player, hitBlock: f.block });
  expect(game.run).toHaveBeenCalledTimes(2);
});
it("filters nonplayers, other blocks and noncreative break events", () => {
  const f = fixture();
  registerWarpBlockHits({ run: vi.fn() });
  const hit = game.hit.mock.calls[0]?.[0];
  const before = game.beforeBreak.mock.calls[0]?.[0];
  hit({ damagingEntity: {}, hitBlock: f.block });
  hit({
    damagingEntity: f.player,
    hitBlock: { ...f.block, typeId: "minecraft:stone" },
  });
  const event = {
    player: { ...f.player, getGameMode: () => "Survival" },
    block: f.block,
    cancel: false,
  };
  before(event);
  expect(event.cancel).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
});
it("returns one item including creative, drops overflow, removes the block and translates messages", () => {
  const f = fixture();
  const leftover = { typeId: WARP_BLOCK_TYPE, amount: 1 };
  f.addItem.mockReturnValue(leftover);
  const effects = new BedrockWarpBlockHits().at(
    asPlayerId("player"),
    asDimensionId(f.dimension.id),
    f.block.location,
  );
  expect(effects).toBeDefined();
  effects?.showRemaining(4);
  effects?.showRemaining(1);
  effects?.drop();
  effects?.remove();
  expect(f.player.onScreenDisplay.setActionBar.mock.calls).toEqual([
    [{ translate: WARP_MESSAGE.hitsLeft, with: ["4"] }],
    [{ translate: "yasu_build.warp.hit_left", with: ["1"] }],
    [{ translate: WARP_MESSAGE.blockBroken }],
  ]);
  expect(f.addItem).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining(leftover),
  );
  expect(f.dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
    leftover,
    f.player.location,
  );
  expect(f.block.setType).toHaveBeenCalledExactlyOnceWith("minecraft:air");
});
it("ignores missing blocks, unloaded cells, lookup errors and departed players", () => {
  const f = fixture();
  const adapter = new BedrockWarpBlockHits();
  const at = () =>
    adapter.at(
      asPlayerId("player"),
      asDimensionId(f.dimension.id),
      f.block.location,
    );
  for (const block of [undefined, { ...f.block, typeId: "minecraft:air" }]) {
    f.dimension.getBlock.mockReturnValue(block);
    expect(at()).toBeUndefined();
  }
  f.dimension.getBlock.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(at()).toBeUndefined();
  f.player.isValid = false;
  expect(at()).toBeUndefined();
});
