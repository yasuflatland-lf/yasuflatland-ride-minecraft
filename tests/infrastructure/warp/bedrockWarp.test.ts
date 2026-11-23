import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import type { Cell } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { ticks } from "../../../src/domain/shared/ticks";
import { asWarpPointId } from "../../../src/domain/warp/ids";
import type { WarpName } from "../../../src/domain/warp/warpName";
import { BedrockWarpPlayers } from "../../../src/infrastructure/warp/bedrock/bedrockWarpPlayers";
import { BedrockWarpWorld } from "../../../src/infrastructure/warp/bedrock/bedrockWarpWorld";
import { SystemWarpTicks } from "../../../src/infrastructure/warp/bedrock/systemWarpTicks";
import { WARP_BLOCK_TYPE } from "../../../src/infrastructure/warp/identifiers";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  runTimeout: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  system: game,
  GameMode: { Creative: "Creative" },
}));
beforeEach(() => vi.resetAllMocks());
const dimensionId = asDimensionId("minecraft:overworld");
const playerId = asPlayerId("player");
const feet = { x: -10, y: 64, z: 20 };
const point = {
  id: asWarpPointId("point"),
  name: "Warp 1" as WarpName,
  owner: "Alex",
  dimension: dimensionId,
  cell: feet,
};
const air = { typeId: "minecraft:air", isAir: true, isLiquid: false };
const stone = { ...air, typeId: "minecraft:stone", isAir: false };

function fixture() {
  const blocks = new Map<number, typeof air | undefined>([
    [63, stone],
    [64, air],
    [65, air],
  ]);
  const solid = new Set([63]);
  const dimension = {
    id: dimensionId,
    getBlock: vi.fn((cell: Cell) => blocks.get(cell.y)),
    getBlockAbove: vi.fn((cell: Cell) =>
      solid.has(cell.y) ? { ...blocks.get(cell.y), location: cell } : undefined,
    ),
  };
  const player = {
    typeId: "minecraft:player",
    isValid: true,
    dimension,
    location: { x: 1.25, y: 64.5, z: -3.75 },
    name: "Alex",
    teleport: vi.fn(),
  };
  game.getDimension.mockReturnValue(dimension);
  game.getEntity.mockReturnValue(player);
  return {
    blocks,
    solid,
    dimension,
    player,
    world: new BedrockWarpWorld(),
    players: new BedrockWarpPlayers(),
  };
}

it.each([
  [WARP_BLOCK_TYPE, "present"],
  ["minecraft:stone", "gone"],
  [undefined, "unloaded"],
] as const)("reports presence for %s", (typeId, expected) => {
  const f = fixture();
  f.blocks.set(64, typeId === undefined ? undefined : { ...air, typeId });
  expect(f.world.presence(point)).toBe(expected);
  expect(game.getDimension).toHaveBeenCalledWith(dimensionId);
  expect(f.dimension.getBlock).toHaveBeenCalledWith(feet);
});

it.each(["dimension", "block"])(
  "keeps points when the %s lookup throws",
  (where) => {
    const f = fixture();
    (where === "dimension"
      ? game.getDimension
      : f.dimension.getBlock
    ).mockImplementation(() => {
      throw Error("unavailable");
    });
    expect(f.world.presence(point)).toBe("unloaded");
    expect(f.world.isStandable(dimensionId, feet)).toBe(false);
  },
);

it("accepts air above a solid floor and probes the three cells", () => {
  const f = fixture();
  expect(f.world.isStandable(dimensionId, feet)).toBe(true);
  expect(f.dimension.getBlock.mock.calls.map(([cell]) => cell)).toEqual(
    expect.arrayContaining([feet, { ...feet, y: 63 }, { ...feet, y: 65 }]),
  );
  expect(f.dimension.getBlockAbove).toHaveBeenCalledWith(
    { ...feet, y: 63 },
    {
      maxDistance: 1,
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    },
  );
  expect(f.dimension.getBlockAbove.mock.calls.map(([cell]) => cell)).toEqual(
    expect.arrayContaining([feet, { ...feet, y: 63 }, { ...feet, y: 65 }]),
  );
});

it.each([64, 65])(
  "rejects solid or liquid at height %s but accepts grass",
  (y) => {
    const f = fixture();
    f.blocks.set(y, stone);
    f.solid.add(y);
    expect(f.world.isStandable(dimensionId, feet)).toBe(false);
    f.solid.delete(y);
    f.blocks.set(y, {
      ...air,
      typeId: "minecraft:water",
      isAir: false,
      isLiquid: true,
    });
    expect(f.world.isStandable(dimensionId, feet)).toBe(false);
    f.blocks.set(y, { ...air, typeId: "minecraft:tall_grass", isAir: false });
    expect(f.world.isStandable(dimensionId, feet)).toBe(true);
  },
);

it.each([
  air,
  { ...air, typeId: "minecraft:water", isLiquid: true, isAir: false },
  { ...air, typeId: "minecraft:tall_grass", isAir: false },
])("rejects a floor of $typeId", (block) => {
  const f = fixture();
  f.blocks.set(63, block);
  f.solid.delete(63);
  expect(f.world.isStandable(dimensionId, feet)).toBe(false);
});

it.each(["lava", "flowing_lava", "fire", "soul_fire", "cactus", "magma"])(
  "rejects %s in every landing cell",
  (hazard) => {
    for (const y of [63, 64, 65]) {
      const f = fixture();
      f.blocks.set(y, {
        ...(y === 63 ? stone : air),
        typeId: `minecraft:${hazard}`,
      });
      expect(f.world.isStandable(dimensionId, feet)).toBe(false);
    }
  },
);

it.each([63, 64, 65])("rejects an unavailable cell at height %s", (y) => {
  const f = fixture();
  f.blocks.set(y, undefined);
  expect(f.world.isStandable(dimensionId, feet)).toBe(false);
});

it.each([63, 64, 65])(
  "rejects a throwing solid-block query at height %s",
  (y) => {
    const f = fixture();
    f.dimension.getBlockAbove.mockImplementation((cell) => {
      if (cell.y === y) throw Error("unloaded");
      return f.solid.has(cell.y)
        ? { ...f.blocks.get(cell.y), location: cell }
        : undefined;
    });
    expect(f.world.isStandable(dimensionId, feet)).toBe(false);
  },
);

it("does not use a solid block outside the floor cell as support", () => {
  const f = fixture();
  f.dimension.getBlockAbove.mockReturnValue({
    ...stone,
    location: { ...feet, y: 64 },
  });
  expect(f.world.isStandable(dimensionId, feet)).toBe(false);
});

it("handles block properties becoming unavailable", () => {
  const f = fixture();
  f.blocks.set(64, {
    ...air,
    get typeId(): string {
      throw Error("unloaded");
    },
  });
  expect(f.world.presence(point)).toBe("unloaded");
  expect(f.world.isStandable(dimensionId, feet)).toBe(false);
});

it("centers teleport destinations and preserves facing across dimensions", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -10000, max: 10000 }),
        y: fc.integer({ min: -60, max: 300 }),
        z: fc.integer({ min: -10000, max: 10000 }),
      }),
      (cell) => {
        const f = fixture();
        const destination = asDimensionId("minecraft:nether");
        expect(f.world.teleport(playerId, destination, cell)).toBe(true);
        expect(game.getDimension).toHaveBeenCalledWith(destination);
        expect(f.player.teleport).toHaveBeenCalledExactlyOnceWith(
          { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 },
          { dimension: f.dimension },
        );
      },
    ),
  );
});

it.each([
  "missing",
  "invalid",
  "wrong type",
  "lookup throws",
  "teleport throws",
  "dimension throws",
])("handles a player when %s", (reason) => {
  const f = fixture();
  if (reason === "missing") game.getEntity.mockReturnValue(undefined);
  if (reason === "invalid") f.player.isValid = false;
  if (reason === "wrong type") f.player.typeId = "minecraft:pig";
  if (reason === "lookup throws")
    game.getEntity.mockImplementation(() => {
      throw Error("invalid id");
    });
  if (reason === "teleport throws")
    f.player.teleport.mockImplementation(() => {
      throw Error("unloaded");
    });
  if (reason === "dimension throws")
    game.getDimension.mockImplementation(() => {
      throw Error("unknown dimension");
    });
  expect(f.world.teleport(playerId, dimensionId, feet)).toBe(false);
  if (reason !== "teleport throws" && reason !== "dimension throws") {
    expect(f.player.teleport).not.toHaveBeenCalled();
    expect(f.players.locationOf(playerId)).toBeUndefined();
    expect(f.players.nameOf(playerId)).toBeUndefined();
  }
});

it("reads the player's name, dimension and fractional position", () => {
  const f = fixture();
  expect(f.players.locationOf(playerId)).toEqual({
    dimension: dimensionId,
    position: f.player.location,
  });
  expect(f.players.nameOf(playerId)).toBe("Alex");
  expect(game.getEntity).toHaveBeenCalledWith(playerId);
});

it("waits for the requested tick callback before resolving", async () => {
  const resolved = vi.fn();
  const waiting = new SystemWarpTicks().wait(ticks(7)).then(resolved);
  expect(game.runTimeout).toHaveBeenCalledExactlyOnceWith(
    expect.any(Function),
    7,
  );
  await Promise.resolve();
  expect(resolved).not.toHaveBeenCalled();
  game.runTimeout.mock.calls[0]?.[0]();
  await waiting;
  expect(resolved).toHaveBeenCalledOnce();
});
