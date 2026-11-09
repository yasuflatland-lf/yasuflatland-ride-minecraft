import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FURNITURE_SPEC,
  type FurnitureKind,
  furniturePose,
} from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockFurnitureWorld } from "../../../src/infrastructure/resort/bedrock/bedrockFurnitureWorld";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
  FURNITURE_TOP_CELLS,
} from "../../../src/infrastructure/resort/identifiers";

import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  playerById: vi.fn(),
  giveOrDrop: vi.fn(),
  consumeHeld: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  BlockPermutation: { resolve: (typeId: string) => ({ typeId }) },
  Direction: { Up: "Up" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));
vi.mock("../../../src/infrastructure/shared/players", () => ({
  playerById: game.playerById,
  giveOrDrop: game.giveOrDrop,
  consumeHeld: game.consumeHeld,
  isCreative: () => false,
}));
beforeEach(() => vi.resetAllMocks());
describe.each(Object.keys(FURNITURE_IDS) as FurnitureKind[])("%s", (kind) => {
  function fixture() {
    const dimension = { spawnEntity: vi.fn(), spawnItem: vi.fn() };
    const entity = {
      id: "furniture",
      typeId: FURNITURE_IDS[kind].entity,
      isValid: true,
      dimension,
      location: { x: 0, y: 64, z: 0 },
      setRotation: vi.fn(),
      remove: vi.fn(),
      getComponent: vi.fn(),
    };
    game.getEntity.mockReturnValue(entity);
    game.getDimension.mockReturnValue(dimension);
    dimension.spawnEntity.mockReturnValue(entity);
    const topHosts = new TopHostRegistry();
    const surface = FURNITURE_SPEC.dining_table.top;
    if (surface)
      topHosts.registerHost({
        hostType: "dining_table",
        entityTypeId: FURNITURE_IDS.dining_table.entity,
        surface,
        isTopNow: () => true,
        refusalHints: { full: "full", overlap: "overlap", tooBig: "tooBig" },
      });
    const itemsOnTop = vi.spyOn(topHosts, "itemsOnTop").mockReturnValue([]);
    const adapter = new BedrockFurnitureWorld({
      topHosts,
      isVehicleSpace: () => false,
      isCampSpace: () => false,
    });
    return { dimension, entity, adapter, itemsOnTop };
  }
  const id = asFurnitureId("furniture");
  const player = asPlayerId("player");
  it("spawns the selected kind at its footprint centre and rolls back a failed rotation", () => {
    const f = fixture();
    const pose = furniturePose({ x: 0, y: 63, z: 0 }, 90, kind);
    expect(f.adapter.spawn(asDimensionId("overworld"), pose)).toBe(id);
    expect(f.dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
      FURNITURE_IDS[kind].entity,
      pose.origin,
    );
    expect(f.entity.setRotation).toHaveBeenCalledWith({ x: 0, y: pose.yaw });
    f.entity.setRotation.mockImplementation(() => {
      throw Error("unloaded");
    });
    expect(f.adapter.spawn(asDimensionId("overworld"), pose)).toBeUndefined();
    expect(f.entity.remove).toHaveBeenCalledOnce();
    f.dimension.spawnEntity.mockImplementation(() => {
      throw Error("missing asset");
    });
    expect(f.adapter.spawn(asDimensionId("overworld"), pose)).toBeUndefined();
  });
  it("recognizes occupancy and ignores unrelated or invalid entities", () => {
    const f = fixture();
    expect(f.adapter.kindOf(id)).toBe(kind);
    expect(f.adapter.isOccupied(id)).toBe(false);
    f.entity.getComponent.mockReturnValue({
      getRiders: () => [{ id: "rider" }],
    });
    expect(f.adapter.isOccupied(id)).toBe(true);
    expect(f.adapter.somethingOnTop(id)).toBe(false);
    f.entity.typeId = "minecraft:pig";
    expect(f.adapter.kindOf(id)).toBeUndefined();
    f.entity.typeId = FURNITURE_IDS[kind].entity;
    f.entity.isValid = false;
    expect(f.adapter.kindOf(id)).toBeUndefined();
  });
  it("blocks recovery only for a registered top with hosted contents", () => {
    const f = fixture();
    f.itemsOnTop.mockReturnValue([
      { at: { x: 0, z: 0 }, footprint: { halfX: 1, halfZ: 1 } },
    ]);
    expect(f.adapter.somethingOnTop(id)).toBe(kind === "dining_table");
    if (kind === "dining_table")
      expect(f.itemsOnTop).toHaveBeenCalledWith("dining_table", id);
    else expect(f.itemsOnTop).not.toHaveBeenCalled();
    f.itemsOnTop.mockReturnValue([]);
    expect(f.adapter.somethingOnTop(id)).toBe(false);
    f.entity.isValid = false;
    expect(f.adapter.somethingOnTop(id)).toBe(false);
  });
  it("charges and returns the matching item, with a fallback drop for server test hooks", () => {
    const f = fixture();
    const receiver = { onScreenDisplay: { setActionBar: vi.fn() } };
    game.playerById.mockReturnValue(receiver);
    game.consumeHeld.mockReturnValue(true);
    expect(f.adapter.consumeItem(player, kind, 2)).toBe(true);
    expect(game.consumeHeld).toHaveBeenCalledExactlyOnceWith(
      receiver,
      FURNITURE_IDS[kind].item,
      2,
    );
    f.adapter.dropItem(id, player);
    f.adapter.refund(player, kind, 2);
    expect(game.giveOrDrop).toHaveBeenCalledTimes(2);
    expect(game.giveOrDrop).toHaveBeenCalledWith(receiver, [
      { typeId: FURNITURE_IDS[kind].item, amount: 1 },
    ]);
    f.adapter.showHitsLeft(player, 2);
    expect(receiver.onScreenDisplay.setActionBar).toHaveBeenCalledWith({
      translate: "yasu_ride.furniture.hits_left",
      with: ["2"],
    });
    game.playerById.mockReturnValue(undefined);
    f.adapter.dropItem(id, player);
    expect(f.dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
      { typeId: FURNITURE_IDS[kind].item, amount: 1 },
      f.entity.location,
    );
  });
});

describe("furniture top blocks", () => {
  const id = asFurnitureId("table");
  const dimensionId = asDimensionId("overworld");
  const cell = { x: -2, y: 64, z: 3 };
  function fixture() {
    const blocks = new Map<string, string>();
    const unavailable = new Set<string>();
    const key = (at: { x: number; y: number; z: number }) =>
      `${at.x},${at.y},${at.z}`;
    const dimension = {
      id: dimensionId,
      getBlock: vi.fn((at: typeof cell) => {
        if (unavailable.has(key(at))) return undefined;
        return {
          typeId: blocks.get(key(at)) ?? "minecraft:air",
          isAir:
            !blocks.has(key(at)) || blocks.get(key(at)) === "minecraft:air",
          setPermutation: ({ typeId }: { typeId: string }) =>
            blocks.set(key(at), typeId),
        };
      }),
    };
    const properties = new Map<string, unknown>();
    const entity = {
      id,
      typeId: FURNITURE_IDS.dining_table.entity,
      isValid: true,
      dimension,
      location: { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 },
      getRotation: () => ({ y: 90 }),
      getDynamicProperty: (name: string) => properties.get(name),
      setDynamicProperty: (name: string, value: unknown) =>
        properties.set(name, value),
    };
    game.getEntity.mockReturnValue(entity);
    game.getDimension.mockReturnValue(dimension);
    const isVehicleSpace = vi.fn(() => false);
    const topHosts = new TopHostRegistry();
    topHosts.registerHost({
      hostType: "dining_table",
      entityTypeId: FURNITURE_IDS.dining_table.entity,
      surface: {
        half: { halfX: 7.5, halfZ: 7.5 },
        topPx: 12,
        limit: 4,
        clearanceBase: 1,
      },
      isTopNow: () => true,
      refusalHints: { full: "full", overlap: "overlap", tooBig: "tooBig" },
    });
    const itemsOnTop = vi.spyOn(topHosts, "itemsOnTop").mockReturnValue([]);
    const create = () =>
      new BedrockFurnitureWorld({
        topHosts,
        isVehicleSpace,
        isCampSpace: () => false,
      });
    return {
      adapter: create(),
      itemsOnTop,
      create,
      entity,
      blocks,
      properties,
      unavailable,
      key,
      isVehicleSpace,
    };
  }
  it("blocks only owned destination cells overlapping hosted gear", () => {
    const f = fixture();
    f.adapter.layTop(id);
    const above = { ...cell, y: cell.y + 1 };
    const footprint = { halfX: 2, halfZ: 3 };
    expect(f.adapter.hostedAbove(dimensionId, above)).toBe(false);
    f.itemsOnTop.mockReturnValue([{ at: { x: 0, z: 0 }, footprint }]);
    expect(f.adapter.hostedAbove(dimensionId, above)).toBe(true);
    expect(
      f.adapter.hostedAbove(dimensionId, { ...above, x: above.x + 1 }),
    ).toBe(false);
    expect(
      f.adapter.hostedAbove(dimensionId, { ...above, y: above.y + 1 }),
    ).toBe(false);
    f.itemsOnTop.mockReturnValue([{ at: { x: 20, z: 0 }, footprint }]);
    expect(f.adapter.hostedAbove(dimensionId, above)).toBe(false);
    f.itemsOnTop.mockReturnValue([{ at: { x: 0, z: 0 }, footprint }]);
    f.entity.isValid = false;
    expect(f.adapter.hostedAbove(dimensionId, above)).toBe(false);
  });
  it("checks only cells overlapping the hosted footprint, including unavailable blocks", () => {
    const f = fixture();
    const footprint = { halfX: 2, halfZ: 3 };
    const above = { ...cell, y: cell.y + 1 };
    expect(
      f.adapter.blockedAt(f.entity as never, { x: 0, z: 0 }, footprint),
    ).toBe(false);
    f.blocks.set(f.key(above), "minecraft:stone");
    expect(
      f.adapter.blockedAt(f.entity as never, { x: 0, z: 0 }, footprint),
    ).toBe(true);
    expect(
      f.adapter.blockedAt(f.entity as never, { x: 20, z: 0 }, footprint),
    ).toBe(false);
    f.blocks.clear();
    f.unavailable.add(f.key(above));
    expect(
      f.adapter.blockedAt(f.entity as never, { x: 0, z: 0 }, footprint),
    ).toBe(true);
  });
  it("persists, remembers on reload, repairs and clears recorded blocks", () => {
    const f = fixture();
    f.adapter.layTop(id);
    expect(f.blocks.get(f.key(cell))).toBe(DINING_TABLE_TOP);
    expect(f.properties.get(FURNITURE_TOP_CELLS)).toBe(JSON.stringify([cell]));
    const reloaded = f.create();
    reloaded.remember(f.entity as never);
    expect(reloaded.ownerAt(dimensionId, cell)).toBe(id);
    expect(reloaded.ownerAt(asDimensionId("nether"), cell)).toBeUndefined();
    f.blocks.set(f.key(cell), "minecraft:air");
    expect(reloaded.ownerAt(dimensionId, cell)).toBeUndefined();
    reloaded.layTop(id);
    expect(f.blocks.get(f.key(cell))).toBe(DINING_TABLE_TOP);
    expect(reloaded.clearTop(id)).toBe(true);
    expect(f.blocks.get(f.key(cell))).toBe("minecraft:air");
    expect(f.properties.get(FURNITURE_TOP_CELLS)).toBeUndefined();
    expect(reloaded.ownerAt(dimensionId, cell)).toBeUndefined();
  });
  it("skips non-air, vehicle space and cells owned by another table", () => {
    const f = fixture();
    for (const type of ["minecraft:stone", DINING_TABLE_TOP]) {
      f.blocks.set(f.key(cell), type);
      f.adapter.layTop(id);
      expect(f.blocks.get(f.key(cell))).toBe(type);
      expect(f.properties.get(FURNITURE_TOP_CELLS)).toBeUndefined();
      expect(f.adapter.ownerAt(dimensionId, cell)).toBeUndefined();
    }
    f.blocks.clear();
    f.isVehicleSpace.mockReturnValue(true);
    f.adapter.layTop(id);
    expect(f.blocks.size).toBe(0);
    expect(f.properties.get(FURNITURE_TOP_CELLS)).toBeUndefined();
  });
  it("preserves replacement blocks and retries unloaded cells after entity removal", () => {
    const f = fixture();
    f.adapter.layTop(id);
    f.blocks.set(f.key(cell), "minecraft:stone");
    expect(f.adapter.clearTop(id)).toBe(true);
    expect(f.blocks.get(f.key(cell))).toBe("minecraft:stone");
    f.blocks.clear();
    f.adapter.layTop(id);
    f.unavailable.add(f.key(cell));
    f.entity.isValid = false;
    expect(f.adapter.clearTop(id)).toBe(false);
    f.unavailable.clear();
    expect(f.adapter.clearTop(id)).toBe(true);
    expect(f.blocks.get(f.key(cell))).toBe("minecraft:air");
  });
  it("clears stale cells when the loaded pose changes", () => {
    const f = fixture();
    f.adapter.layTop(id);
    f.entity.location.x++;
    f.adapter.layTop(id);
    expect(f.blocks.get(f.key(cell))).toBe("minecraft:air");
    expect(f.blocks.get(f.key({ ...cell, x: cell.x + 1 }))).toBe(
      DINING_TABLE_TOP,
    );
    expect(JSON.parse(String(f.properties.get(FURNITURE_TOP_CELLS)))).toEqual([
      { ...cell, x: cell.x + 1 },
    ]);
  });
  it("checks wanted and persisted cells above the top, conservatively refusing unloaded cells", () => {
    const f = fixture();
    const above = { ...cell, y: cell.y + 1 };
    expect(f.adapter.blockAboveTop(id)).toBe(false);
    f.blocks.set(f.key(above), "minecraft:stone");
    expect(f.adapter.blockAboveTop(id)).toBe(true);
    f.blocks.clear();
    f.unavailable.add(f.key(above));
    expect(f.adapter.blockAboveTop(id)).toBe(true);
    f.unavailable.clear();
    f.properties.set(FURNITURE_TOP_CELLS, JSON.stringify([{ ...cell, x: 10 }]));
    f.blocks.set(f.key({ ...above, x: 10 }), "minecraft:stone");
    expect(f.adapter.blockAboveTop(id)).toBe(true);
    f.entity.typeId = FURNITURE_IDS.dining_chair.entity;
    f.properties.clear();
    expect(f.adapter.blockAboveTop(id)).toBe(false);
    f.adapter.layTop(id);
    expect(f.properties.size).toBe(0);
  });
});
