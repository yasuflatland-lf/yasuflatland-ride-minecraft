import { Player } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockWarpBlockTaps } from "../../../src/infrastructure/warp/bedrock/bedrockWarpBlockTaps";
import { registerWarpBlockHits } from "../../../src/infrastructure/warp/handlers/blockHits";
import { WarpFormGuard } from "../../../src/infrastructure/warp/handlers/formGuard";
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
const flush = async () => {
  for (let n = 0; n < 5; n++) await Promise.resolve();
};
it("cancels creative breaks, defers the rename form and coalesces both paths", async () => {
  const f = fixture();
  const rename = { run: vi.fn().mockResolvedValue(undefined) };
  const guard = new WarpFormGuard();
  registerWarpBlockHits(rename, guard);
  const event = { player: f.player, block: f.block, cancel: false };
  game.beforeBreak.mock.calls[0]?.[0](event);
  game.hit.mock.calls[0]?.[0]({ damagingEntity: f.player, hitBlock: f.block });
  expect(event.cancel).toBe(true);
  expect(game.run).toHaveBeenCalledOnce();
  expect(rename.run).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(rename.run).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    dimension: f.dimension.id,
    cell: f.block.location,
  });
  game.tick += 100;
  game.hit.mock.calls[0]?.[0]({ damagingEntity: f.player, hitBlock: f.block });
  expect(game.run).toHaveBeenCalledTimes(2);
});
it("ignores hits while a warp form is open and skips a departed player", async () => {
  const f = fixture();
  const rename = { run: vi.fn().mockResolvedValue(undefined) };
  const guard = new WarpFormGuard();
  registerWarpBlockHits(rename, guard);
  guard.hold(asPlayerId("player"), 0);
  game.hit.mock.calls[0]?.[0]({ damagingEntity: f.player, hitBlock: f.block });
  expect(game.run).not.toHaveBeenCalled();
  guard.close(asPlayerId("player"));
  game.tick += 100;
  game.hit.mock.calls[0]?.[0]({ damagingEntity: f.player, hitBlock: f.block });
  f.player.isValid = false;
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(rename.run).not.toHaveBeenCalled();
  expect(guard.tryOpen(asPlayerId("player"), game.tick + 100)).toBe(true);
});
it("filters nonplayers, other blocks and noncreative break events", () => {
  const f = fixture();
  registerWarpBlockHits({ run: vi.fn() }, new WarpFormGuard());
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
it("returns one item including creative, removes the block and translates messages", () => {
  const f = fixture();
  const effects = new BedrockWarpBlockTaps().at(
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
    [{ translate: WARP_MESSAGE.tapsLeft, with: ["4"] }],
    [{ translate: "yasu_build.warp.tap_left", with: ["1"] }],
    [{ translate: WARP_MESSAGE.blockBroken }],
  ]);
  expect(f.addItem).toHaveBeenCalledExactlyOnceWith({
    typeId: WARP_BLOCK_TYPE,
    amount: 1,
  });
  expect(f.block.setType).toHaveBeenCalledExactlyOnceWith("minecraft:air");
});
it("ignores missing blocks, unloaded cells, lookup errors and departed players", () => {
  const f = fixture();
  const adapter = new BedrockWarpBlockTaps();
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
