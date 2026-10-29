import { beforeEach, expect, it, vi } from "vitest";
import { asGasLanternId } from "../../../src/domain/camp/gasLantern";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import { BedrockGasLanternWorld } from "../../../src/infrastructure/camp/bedrock/bedrockGasLanternWorld";
import { createGasLanternLight } from "../../../src/infrastructure/camp/bedrock/gasLanternLight";
import {
  GAS_LANTERN_CELLS_PROPERTY,
  GAS_LANTERN_HOST_PROPERTY,
  GAS_LANTERN_LIT_PROPERTY,
  GAS_LANTERN_TYPE,
  SWITCH_CLICK_SOUND,
} from "../../../src/infrastructure/camp/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  BlockPermutation: { resolve: (id: string) => ({ id }) },
}));
beforeEach(() => vi.resetAllMocks());

function fixture() {
  const blocks = new Map<string, string>();
  const at = (c: Cell) => blocks.get(cellKey(c)) ?? "minecraft:air";
  const dimension = {
    id: "minecraft:overworld",
    playSound: vi.fn(),
    getEntities: vi.fn(() => [entity]),
    getBlock: (c: Cell) => ({
      get typeId() {
        return at(c);
      },
      get isAir() {
        return at(c) === "minecraft:air";
      },
      setType: (id: string) => blocks.set(cellKey(c), id),
      setPermutation: (p: { id: string }) => blocks.set(cellKey(c), p.id),
    }),
  };
  const properties = new Map<string, unknown>([
    [GAS_LANTERN_LIT_PROPERTY, false],
  ]);
  const saved = new Map<string, unknown>();
  const entity = {
    id: "lantern",
    typeId: GAS_LANTERN_TYPE,
    isValid: true,
    dimension,
    location: { x: 2.5, y: 64, z: -3.5 },
    getProperty: (key: string) => properties.get(key),
    setProperty: (key: string, value: unknown) => properties.set(key, value),
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === entity.id && entity.isValid ? entity : undefined,
  );
  game.getDimension.mockImplementation((name: string) =>
    name === "overworld" ? dimension : { getEntities: () => [] },
  );
  const makeWorld = () =>
    new BedrockGasLanternWorld(
      { isVehicleSpace: () => false },
      createGasLanternLight(),
    );
  const id = asGasLanternId(entity.id);
  const cell = { x: 2, y: 64, z: -4 };
  return {
    world: makeWorld(),
    makeWorld,
    entity,
    id,
    cell,
    at,
    blocks,
    saved,
    dimension,
  };
}

it("lays, repairs, moves, and clears light saved across a reload", () => {
  const f = fixture();
  expect(f.world.isLit(f.id)).toBe(false);
  f.world.setLit(f.id, true);
  f.world.relayLight(f.id);
  expect(f.dimension.playSound).toHaveBeenCalledExactlyOnceWith(
    SWITCH_CLICK_SOUND,
    f.entity.location,
  );
  expect(f.at(f.cell)).toBe("minecraft:light_block_15");
  expect(JSON.parse(String(f.saved.get(GAS_LANTERN_CELLS_PROPERTY)))).toEqual([
    { ...f.cell, block: { level: 15 } },
  ]);
  f.blocks.delete(cellKey(f.cell));
  f.world.relayLoaded();
  expect(f.at(f.cell)).toBe("minecraft:light_block_15");
  f.entity.location.y -= 1;
  const moved = { ...f.cell, y: 63 };
  f.world = f.makeWorld();
  f.world.relayLoaded();
  expect(f.at(f.cell)).toBe("minecraft:air");
  expect(f.at(moved)).toBe("minecraft:light_block_15");
  expect(game.getDimension.mock.calls.map(([name]) => name)).toEqual([
    "overworld",
    "nether",
    "the_end",
    "overworld",
    "nether",
    "the_end",
  ]);
  f.world.setLit(f.id, false);
  f.world.relayLight(f.id);
  expect(f.at(moved)).toBe("minecraft:air");
  expect(f.saved.get(GAS_LANTERN_CELLS_PROPERTY)).toBeUndefined();
});

it("clears a removed lantern on the loaded pass and preserves a player's replacement block", () => {
  for (const replacement of ["minecraft:light_block_15", "minecraft:stone"]) {
    const f = fixture();
    f.world.setLit(f.id, true);
    f.world.relayLoaded();
    f.blocks.set(cellKey(f.cell), replacement);
    f.entity.isValid = false;
    f.dimension.getEntities.mockReturnValue([]);
    f.world.relayLoaded();
    expect(f.world.isLit(f.id)).toBeUndefined();
    expect(f.at(f.cell)).toBe(
      replacement === "minecraft:stone" ? replacement : "minecraft:air",
    );
  }
});

it("clears saved light before take-back even before the first loaded pass", () => {
  const f = fixture();
  f.world.setLit(f.id, true);
  f.world.relayLight(f.id);
  f.world = f.makeWorld();
  f.world.clearLight(f.id);
  expect(f.at(f.cell)).toBe("minecraft:air");
  f.entity.typeId = "minecraft:pig";
  expect(f.world.isLit(f.id)).toBeUndefined();
  f.world.relayLight(f.id);
  expect(f.at(f.cell)).toBe("minecraft:air");
});

it("reads a lantern's host marker, its loaded host area, and whether a host exists", () => {
  const f = fixture();
  expect(f.world.loadedGasLanterns()).toEqual([f.id]);
  expect(f.world.host(f.id)).toBe("");
  f.saved.set(GAS_LANTERN_HOST_PROPERTY, "camp_table:table:@1,0");
  expect(f.world.host(f.id)).toBe("camp_table:table:@1,0");
  expect(f.world.isHostAreaLoaded(f.id)).toBe(true);
  expect(f.world.hostExists(f.id)).toBe(true);
  expect(f.world.hostExists("table")).toBe(false);
  f.entity.isValid = false;
  expect(f.world.host(f.id)).toBe("");
  expect(f.world.isHostAreaLoaded(f.id)).toBe(false);
});
