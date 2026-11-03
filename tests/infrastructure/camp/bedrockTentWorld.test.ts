import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoldLegacyTents } from "../../../src/application/camp/foldLegacyTents";
import type { SpaceCheck } from "../../../src/application/shared/ports/space";
import { legacyTentClearCells } from "../../../src/domain/camp/legacyTent";
import { TENT_LAYOUT_VERSION } from "../../../src/domain/camp/spec";
import {
  asTentId,
  type FlapId,
  flapCells,
  PITCHED_STATE,
  type TentPose,
  tentCellAt,
  tentCells,
  tentClearCells,
  tentEntityLocation,
  tentFootprintBox,
  tentGroundCells,
} from "../../../src/domain/camp/tent";
import type { TentEntry } from "../../../src/domain/camp/tentRegistry";
import { cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import { BedrockTentWorld } from "../../../src/infrastructure/camp/bedrock/bedrockTentWorld";
import { TENT_CELL_CODEC } from "../../../src/infrastructure/camp/bedrock/tentBlocks";
import { TentFlapStore } from "../../../src/infrastructure/camp/bedrock/tentFlapStore";
import {
  FLAP_BLOCKED_HINT,
  PITCH_REFUSAL_MESSAGE,
  TENT_CEILING_BLOCK,
  TENT_FLAP_BLOCK,
  TENT_ITEM,
  TENT_OPEN_STATE,
  TENT_TYPE,
  TENT_WALL_BLOCK,
} from "../../../src/infrastructure/camp/identifiers";
import type { DynamicPropertyTentRegistry } from "../../../src/infrastructure/camp/persistence/tentRegistry";
import type { CellLayer } from "../../../src/infrastructure/shared/laidCells";
import { defined } from "../../support/defined";

const game = vi.hoisted(() => ({ getDimension: vi.fn(), getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Creative: "Creative", Survival: "Survival" },
  BlockPermutation: { resolve: vi.fn() },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));

const DIM = asDimensionId("minecraft:overworld");
const POSE: TentPose = { x: 110, y: -60, z: 46, yaw: 180 };
const TENT = asTentId("tent");

function fixture(entries: TentEntry[] = []) {
  const order: string[] = [];
  const dimension = {
    id: DIM,
    getBlock: vi.fn(),
    getEntities: vi.fn((_q?: unknown) => [] as unknown[]),
    getPlayers: vi.fn((_q?: unknown) => [] as unknown[]),
    spawnEntity: vi.fn(),
    spawnItem: vi.fn(),
  };
  const tent = {
    id: TENT,
    typeId: TENT_TYPE,
    isValid: true,
    location: tentEntityLocation(POSE),
    dimension,
    setRotation: vi.fn(),
    getProperty: vi.fn(() => 0),
    remove: vi.fn(() => order.push("remove")),
  };
  const container = {
    addItem: vi.fn(() => undefined),
    getItem: vi.fn(() => undefined as unknown),
    setItem: vi.fn(),
  };
  const player = {
    id: "player",
    typeId: "minecraft:player",
    isValid: true,
    location: { x: 0, y: 0, z: 0 },
    dimension,
    teleport: vi.fn(),
    getRotation: vi.fn(() => ({ x: 23, y: -137 })),
    getGameMode: vi.fn(() => "Survival"),
    getComponent: vi.fn(() => ({ container })),
    onScreenDisplay: { setActionBar: vi.fn() },
  };
  game.getDimension.mockReturnValue(dimension);
  game.getEntity.mockImplementation((id: string) =>
    id === tent.id ? tent : id === player.id ? player : undefined,
  );
  let list = [...entries];
  const registry = {
    all: vi.fn(() => list),
    add: vi.fn((e: TentEntry) => {
      list = [...list, e];
    }),
    remove: vi.fn((id: string) => {
      order.push("forget");
      list = list.filter((e) => e.id !== id);
    }),
  };
  const blocks = {
    lay: vi.fn(() => order.push("lay")),
    laidBlockOwner: vi.fn(() => undefined),
  };
  const isVehicleSpace = vi.fn<SpaceCheck>(() => false);
  const flaps = new TentFlapStore();
  const world = new BedrockTentWorld({
    isVehicleSpace,
    registry: registry as unknown as DynamicPropertyTentRegistry,
    blocks: blocks as unknown as CellLayer<never, never>,
    flaps,
  });
  return {
    dimension,
    tent,
    player,
    container,
    registry,
    blocks,
    isVehicleSpace,
    flaps,
    world,
    order,
  };
}

const ENTRY: TentEntry = { id: TENT, dimensionId: DIM, pose: POSE, layout: 1 };

describe("BedrockTentWorld (ADR 0131)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("folds legacy blocks through the shared refund and removal paths without clearing replacements", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0 as const, 90 as const, 180 as const, -90 as const),
        fc.array(
          fc.oneof(
            fc.string(),
            fc.constantFrom(
              TENT_WALL_BLOCK,
              TENT_FLAP_BLOCK,
              "yasu_ride:tent_future",
              "minecraft:stone",
              "yasu_ride:roof_tent",
            ),
          ),
          { minLength: 336, maxLength: 336 },
        ),
        (yaw, types) => {
          const entry = { ...ENTRY, pose: { ...POSE, yaw } };
          const { dimension, world, registry, tent, blocks, flaps, order } =
            fixture([entry]);
          const cells = legacyTentClearCells(entry.pose);
          const values = new Map(
            cells.map((cell, index) => [
              cellKey(cell),
              types[index] ?? "minecraft:air",
            ]),
          );
          const original = new Map(values);
          dimension.getBlock.mockImplementation((cell: Vec3) => {
            const at = cellKey(cell);
            return {
              typeId: values.get(at),
              setType: (type: string) => {
                order.push("clear");
                values.set(at, type);
              },
            };
          });
          const forget = vi.spyOn(flaps, "forget");
          const fold = new FoldLegacyTents(world, 2);
          expect(fold.execute()).toBe(0);
          for (const [cell, type] of original)
            expect(values.get(cell)).toBe(
              type.startsWith("yasu_ride:tent_") ? "minecraft:air" : type,
            );
          expect(dimension.getBlock).toHaveBeenCalledTimes(337);
          expect(dimension.getBlock).toHaveBeenNthCalledWith(1, entry.pose);
          expect(dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
            { typeId: TENT_ITEM, amount: 1 },
            tent.location,
          );
          expect(registry.all()).toEqual([]);
          expect(forget).toHaveBeenCalledWith(TENT);
          expect(tent.remove).toHaveBeenCalledTimes(1);
          expect(blocks.lay).toHaveBeenCalledExactlyOnceWith(TENT, tent, []);
          expect(order[0]).toBe("lay");
          expect(order.slice(-2)).toEqual(["forget", "remove"]);
          fold.execute();
          expect(dimension.spawnItem).toHaveBeenCalledTimes(1);
        },
      ),
    );
  });

  it.each(["undefined", "throwing", "unknown dimension"])(
    "leaves an unreadable anchor unchanged (%s) and folds when it loads",
    (unloaded) => {
      const { dimension, world, registry, tent, blocks, player } = fixture([
        ENTRY,
      ]);
      if (unloaded === "throwing")
        dimension.getBlock.mockImplementation(() => {
          throw new Error("LocationInUnloadedChunkError");
        });
      if (unloaded === "unknown dimension")
        game.getDimension.mockImplementation(() => {
          throw new Error("unknown dimension");
        });
      const fold = new FoldLegacyTents(world);
      expect(fold.execute()).toBe(1);
      expect(registry.all()).toEqual([ENTRY]);
      expect(registry.remove).not.toHaveBeenCalled();
      expect(blocks.lay).not.toHaveBeenCalled();
      expect(dimension.getPlayers).not.toHaveBeenCalled();
      expect(dimension.spawnItem).not.toHaveBeenCalled();
      expect(player.teleport).not.toHaveBeenCalled();
      expect(tent.remove).not.toHaveBeenCalled();

      game.getDimension.mockReturnValue(dimension);
      dimension.getBlock.mockReturnValue({ typeId: "minecraft:air" });
      expect(fold.execute()).toBe(0);
      expect(registry.all()).toEqual([]);
      expect(dimension.spawnItem).toHaveBeenCalledTimes(1);
      expect(blocks.lay).toHaveBeenCalledExactlyOnceWith(TENT, tent, []);
    },
  );

  it("uses cell-layer cleanup and drops at the registered pose when the anchor loads before the entity", () => {
    const { dimension, world, registry, blocks } = fixture([ENTRY]);
    game.getEntity.mockReturnValue(undefined);
    dimension.getBlock.mockReturnValue({ typeId: "minecraft:air" });
    expect(world.foldInto(ENTRY)).toBe("folded");
    expect(blocks.lay).toHaveBeenCalledExactlyOnceWith(TENT, undefined, []);
    expect(dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
      { typeId: TENT_ITEM, amount: 1 },
      tentEntityLocation(ENTRY.pose),
    );
    expect(registry.all()).toEqual([]);
  });

  it("ejects players across the legacy box before clearing, including mattresses and tarp cells at each yaw", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0 as const, 90 as const, 180 as const, -90 as const),
        fc.integer({ min: -3, max: 3 }),
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 0, max: 3 }),
        (yaw, x, depth, layer) => {
          const entry = { ...ENTRY, pose: { ...POSE, yaw } };
          const { dimension, world, player, order } = fixture([entry]);
          const cell = tentCellAt(entry.pose, { x, depth, layer });
          player.location = { x: cell.x + 0.5, y: cell.y, z: cell.z + 0.5 };
          const outside = {
            ...player,
            location: tentCellAt(entry.pose, { x: 0, depth: -1, layer: 0 }),
            teleport: vi.fn(),
          };
          dimension.getPlayers.mockReturnValue([player, outside]);
          const ejectRider = vi.fn(() => order.push("eject"));
          player.getComponent.mockReturnValue({
            entityRidingOn: { getComponent: () => ({ ejectRider }) },
          } as never);
          player.teleport.mockImplementation(() => {
            order.push("exit");
          });
          dimension.getBlock.mockReturnValue({
            typeId: TENT_WALL_BLOCK,
            setType: () => {
              order.push("clear");
            },
          });
          new FoldLegacyTents(world, 2).execute();
          const exit = tentCellAt(entry.pose, { x: 0, depth: -1, layer: 0 });
          expect(player.teleport).toHaveBeenCalledExactlyOnceWith(
            { x: exit.x + 0.5, y: exit.y, z: exit.z + 0.5 },
            { dimension },
          );
          expect(outside.teleport).not.toHaveBeenCalled();
          expect(ejectRider).toHaveBeenCalledWith(player);
          expect(order.slice(0, 4)).toEqual(["eject", "exit", "lay", "clear"]);
        },
      ),
    );
  });

  it("surveys a light block as air, and an unloaded or throwing cell as unreadable", () => {
    const { dimension, world } = fixture();
    const clear = tentClearCells(POSE);
    const ground = tentGroundCells(POSE);
    const at = (i: number) => cellKey(clear[i] ?? { x: 0, y: 0, z: 0 });
    dimension.getBlock.mockImplementation(
      (c: { x: number; y: number; z: number }) => {
        const k = cellKey(c);
        if (k === at(0))
          return { typeId: "minecraft:light_block_15", isLiquid: false };
        if (k === at(1)) return undefined;
        if (k === at(2)) throw new Error("unloaded");
        if (k === cellKey(ground[0] ?? c))
          return { typeId: "minecraft:water", isLiquid: true };
        return {
          typeId: c.y < POSE.y ? "minecraft:stone" : "minecraft:air",
          isLiquid: false,
        };
      },
    );
    const survey = world.survey(DIM, POSE);
    expect(survey.clear.slice(0, 4)).toEqual([
      "minecraft:air",
      undefined,
      undefined,
      "minecraft:air",
    ]);
    expect(survey.ground[0]).toEqual({
      typeId: "minecraft:water",
      liquid: true,
    });
    expect(survey.ground[1]).toEqual({
      typeId: "minecraft:stone",
      liquid: false,
    });
    expect(survey.clear).toHaveLength(tentClearCells(POSE).length);
    expect(survey.ground).toHaveLength(tentGroundCells(POSE).length);
  });

  it("finds vehicle space on a footprint cell two layers up", () => {
    const { dimension, isVehicleSpace, world } = fixture();
    dimension.getBlock.mockReturnValue({
      typeId: "minecraft:air",
      isLiquid: false,
    });
    const high = tentCellAt(POSE, { x: -3, depth: 0, layer: 2 });
    isVehicleSpace.mockImplementation((_d, c) => cellKey(c) === cellKey(high));
    expect(world.survey(DIM, POSE).vehicleSpace).toBe(true);
    expect(isVehicleSpace).toHaveBeenCalledTimes(
      tentClearCells(POSE).findIndex((c) => cellKey(c) === cellKey(high)) + 1,
    );
  });

  it("finds another tent's camp space where it overlaps, though its corner strip reads as air", () => {
    const { dimension, world } = fixture([ENTRY]);
    dimension.getBlock.mockReturnValue({
      typeId: "minecraft:air",
      isLiquid: false,
    });
    // Six cells to the side, the new tent's x -3 column is the first one's x 3
    // corner column, which no tent cell takes at depth 0..2.
    const beside = {
      ...tentCellAt(POSE, { x: 6, depth: 0, layer: 0 }),
      yaw: 180 as const,
    };
    expect(world.survey(DIM, beside).campSpace).toBe(true);
    const apart = {
      ...tentCellAt(POSE, { x: 7, depth: 0, layer: 0 }),
      yaw: 180 as const,
    };
    expect(world.survey(DIM, apart).campSpace).toBe(false);
  });

  it("counts players and entities with health in the footprint box, never items or xp orbs", () => {
    const { dimension, world, registry } = fixture([ENTRY]);
    dimension.getBlock.mockReturnValue({
      typeId: "minecraft:air",
      isLiquid: false,
    });
    const withHealth = (typeId: string) => ({
      typeId,
      getComponent: (n: string) => (n === "minecraft:health" ? {} : undefined),
    });
    dimension.getEntities.mockReturnValue([
      { typeId: "minecraft:player", getComponent: () => undefined },
      withHealth("yasu_ride:low_chair"),
      withHealth("minecraft:cow"),
      { typeId: "minecraft:arrow", getComponent: () => undefined },
    ]);
    const survey = world.survey(DIM, POSE);
    expect(survey.occupants).toBe(3);
    expect(survey.tents).toBe(1);
    expect(registry.all).toHaveBeenCalled();
    const box = tentFootprintBox(POSE);
    expect(dimension.getEntities).toHaveBeenCalledWith({
      location: box.min,
      volume: box.size,
      excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
    });
  });

  it("answers camp space and block owners from the registry before any lay", () => {
    const { world, blocks } = fixture([ENTRY]);
    const wall = tentCells(POSE, PITCHED_STATE).find(
      (c) => c.block.type === "wall",
    );
    const ceiling = tentCells(POSE, PITCHED_STATE).find(
      (c) => c.block.type === "ceiling",
    );
    if (!wall || !ceiling) throw new Error("no cells");
    expect(world.isCampSpace(DIM, wall)).toBe(true);
    expect(world.isCampSpace(DIM, { x: 0, y: 0, z: 0 })).toBe(false);
    expect(world.isCampSpace(asDimensionId("minecraft:nether"), wall)).toBe(
      false,
    );
    expect(world.tentBlockOwner(DIM, wall, TENT_WALL_BLOCK)).toBe(TENT);
    expect(world.tentBlockOwner(DIM, ceiling, TENT_CEILING_BLOCK)).toBe(TENT);
    expect(world.tentBlockOwner(DIM, wall, TENT_CEILING_BLOCK)).toBeUndefined();
    expect(world.tentBlockOwner(DIM, wall, "minecraft:stone")).toBeUndefined();
    expect(blocks.laidBlockOwner).toHaveBeenCalledWith(
      DIM,
      wall,
      TENT_WALL_BLOCK,
    );
  });

  it("is occupied while a player's feet are inside", () => {
    const { dimension, player, world } = fixture([ENTRY]);
    dimension.getPlayers.mockReturnValue([player]);
    const room = tentCellAt(POSE, { x: 0, depth: 6, layer: 0 });
    player.location = { x: room.x + 0.5, y: room.y, z: room.z + 0.5 };
    expect(world.isOccupied(TENT)).toBe(true);
    // Feet in a side wall cell are outside its room-side plate.
    const sideWall = tentCellAt(POSE, { x: 3, depth: 6, layer: 0 });
    player.location = {
      x: sideWall.x + 0.5,
      y: sideWall.y,
      z: sideWall.z + 0.5,
    };
    expect(world.isOccupied(TENT)).toBe(false);
    const tarp = tentCellAt(POSE, { x: 0, depth: 1, layer: 0 });
    player.location = { x: tarp.x + 0.5, y: tarp.y, z: tarp.z + 0.5 };
    expect(world.isOccupied(TENT)).toBe(true);
    expect(world.isOccupied(asTentId("other"))).toBe(false);
  });

  it("finds the loaded tent whose rooms hold the feet", () => {
    const { world } = fixture([ENTRY]);
    const room = tentCellAt(POSE, { x: 1, depth: 5, layer: 1 });
    const feet = { x: room.x + 0.5, y: room.y, z: room.z + 0.5 };
    expect(world.tentContaining(DIM, feet)).toBe(TENT);
    const tarp = tentCellAt(POSE, { x: 0, depth: 1, layer: 0 });
    expect(
      world.tentContaining(DIM, {
        x: tarp.x + 0.5,
        y: tarp.y,
        z: tarp.z + 0.5,
      }),
    ).toBe(TENT);
    expect(
      world.tentContaining(asDimensionId("minecraft:nether"), feet),
    ).toBeUndefined();
    game.getEntity.mockReturnValue(undefined);
    expect(world.tentContaining(DIM, feet)).toBeUndefined();
  });

  it("gives the item to the hitter, or drops it at the tent", () => {
    const { container, dimension, tent, world, registry } = fixture([ENTRY]);
    world.returnTentItem(TENT, asPlayerId("player"));
    expect(container.addItem).toHaveBeenCalledWith({
      typeId: TENT_ITEM,
      amount: 1,
    });
    world.returnTentItem(TENT, undefined);
    expect(dimension.spawnItem).toHaveBeenLastCalledWith(
      { typeId: TENT_ITEM, amount: 1 },
      tent.location,
    );
    game.getEntity.mockReturnValue(undefined);
    world.returnTentItem(TENT, undefined);
    expect(dimension.spawnItem).toHaveBeenLastCalledWith(
      { typeId: TENT_ITEM, amount: 1 },
      tentEntityLocation(POSE),
    );
    expect(registry.all).toHaveBeenCalled();
  });

  it("reads the game mode, takes the held tent item, and gives one back only to a player", () => {
    const { container, player, tent, world } = fixture();
    const id = asPlayerId("player");
    const held = { typeId: TENT_ITEM, amount: 1 };
    const inventory = Object.assign(container, {
      getItem: vi.fn(() => held),
      setItem: vi.fn(),
    });
    const withMode = Object.assign(player, {
      getGameMode: vi.fn(() => "Creative"),
    });
    expect(world.isCreative(id)).toBe(true);
    withMode.getGameMode.mockReturnValue("Survival");
    expect(world.isCreative(id)).toBe(false);
    expect(world.consumeTentItem(id, 3)).toBe(true);
    expect(inventory.getItem).toHaveBeenCalledWith(3);
    expect(inventory.setItem).toHaveBeenCalledWith(3, undefined);
    world.giveTentItem(id);
    expect(container.addItem).toHaveBeenCalledWith({
      typeId: TENT_ITEM,
      amount: 1,
    });
    // The tent entity shares the id space but is not a player.
    const notPlayer = asPlayerId(tent.id);
    expect(world.isCreative(notPlayer)).toBe(false);
    expect(world.consumeTentItem(notPlayer, 3)).toBe(false);
    container.addItem.mockClear();
    world.giveTentItem(notPlayer);
    world.giveTentItem(asPlayerId("gone"));
    expect(container.addItem).not.toHaveBeenCalled();
  });

  it("takes down by clearing with the entity, forgetting, then removing", () => {
    const { blocks, order, registry, tent, world } = fixture([ENTRY]);
    world.takeDown(TENT);
    expect(blocks.lay).toHaveBeenCalledWith(TENT, tent, []);
    expect(registry.remove).toHaveBeenCalledWith(TENT);
    expect(order).toEqual(["lay", "forget", "remove"]);
  });

  it("clears a tent's loaded cells by pose when its entity has not loaded yet, sparing a player's block", () => {
    const { blocks, dimension, registry, world } = fixture([ENTRY]);
    game.getEntity.mockReturnValue(undefined);
    const cells = tentCells(POSE, PITCHED_STATE);
    const replaced = cellKey(cells[0] ?? POSE);
    const unloaded = cellKey(cells[1] ?? POSE);
    const set = new Map<string, ReturnType<typeof vi.fn>>();
    dimension.getBlock.mockImplementation(
      (c: { x: number; y: number; z: number }) => {
        const k = cellKey(c);
        if (k === unloaded) throw new Error("unloaded");
        const laid = cells.find((l) => cellKey(l) === k);
        const setType = vi.fn();
        set.set(k, setType);
        return {
          typeId:
            k === replaced || !laid
              ? "minecraft:stone"
              : TENT_CELL_CODEC.blockIdOf(laid.block),
          setType,
        };
      },
    );
    world.takeDown(TENT);
    expect(blocks.lay).toHaveBeenCalledWith(TENT, undefined, []);
    expect(registry.remove).toHaveBeenCalledWith(TENT);
    const cleared = [...set].filter(([, f]) => f.mock.calls.length > 0);
    expect(cleared).toHaveLength(cells.length - 2);
    for (const [, f] of cleared)
      expect(f).toHaveBeenCalledWith("minecraft:air");
    expect(set.get(replaced)).not.toHaveBeenCalled();
  });

  it("does not read the world by pose when the entity is loaded", () => {
    const { dimension, world } = fixture([ENTRY]);
    world.takeDown(TENT);
    expect(dimension.getBlock).not.toHaveBeenCalled();
  });

  it("pitches by spawning, registering, and laying, in one call", () => {
    const { blocks, dimension, registry, tent, world } = fixture();
    dimension.spawnEntity.mockReturnValue(tent);
    expect(world.pitch(DIM, POSE)).toBe(TENT);
    expect(dimension.spawnEntity).toHaveBeenCalledWith(
      TENT_TYPE,
      tentEntityLocation(POSE),
    );
    expect(tent.setRotation).toHaveBeenCalledWith({ x: 0, y: 180 });
    expect(registry.add).toHaveBeenCalledWith({
      ...ENTRY,
      layout: TENT_LAYOUT_VERSION,
    });
    expect(blocks.lay).toHaveBeenCalledWith(
      TENT,
      tent,
      tentCells(POSE, PITCHED_STATE),
    );
    dimension.spawnEntity.mockImplementation(() => {
      throw new Error("no spawn");
    });
    expect(world.pitch(DIM, POSE)).toBeUndefined();
  });

  it("undoes a pitch that fails after the spawn, every step on its own, and logs it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failures = ["add", "lay", "add and undo"] as const;
    for (const failure of failures) {
      const { blocks, dimension, registry, tent, world } = fixture();
      dimension.spawnEntity.mockReturnValue(tent);
      if (failure !== "lay")
        registry.add.mockImplementationOnce(() => {
          throw new Error("write failed");
        });
      if (failure === "lay")
        blocks.lay.mockImplementationOnce(() => {
          throw new Error("lay failed");
        });
      if (failure === "add and undo")
        registry.remove.mockImplementationOnce(() => {
          throw new Error("write failed");
        });
      expect(world.pitch(DIM, POSE)).toBeUndefined();
      expect(registry.remove).toHaveBeenCalledWith(TENT);
      expect(blocks.lay).toHaveBeenLastCalledWith(TENT, tent, []);
      expect(tent.remove).toHaveBeenCalledTimes(1);
    }
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("tent pitch failed"),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("tent pitch undo (registry) failed"),
    );
    warn.mockRestore();
  });

  it("shows the refusal with the limit, the hits left, and the occupied hint", () => {
    const { player, world } = fixture();
    const id = asPlayerId("player");
    world.showPitchRefusal(id, "limit");
    expect(player.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
      translate: PITCH_REFUSAL_MESSAGE.limit,
      with: ["4"],
    });
    world.showPitchRefusal(id, "ground");
    expect(player.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
      translate: PITCH_REFUSAL_MESSAGE.ground,
    });
    world.showHitsLeft(id, 2);
    expect(player.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
      translate: "yasu_ride.hint.tent_hits",
      with: ["2"],
    });
    world.showOccupied(id);
    expect(player.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
      translate: "yasu_ride.hint.tent_occupied",
    });
  });

  it("finds the tent and the flap for a flap cell before any lay, and nothing for a wall (ADR 0132)", () => {
    const { world, blocks } = fixture([ENTRY]);
    for (const flap of ["front", "left", "right", "bedroom"] as const)
      for (const cell of flapCells(POSE, flap))
        expect(world.flapAt(DIM, cell)).toEqual({ tentId: TENT, flap });
    const wall = tentCells(POSE, PITCHED_STATE).find(
      (c) => c.block.type === "wall",
    );
    if (!wall) throw new Error("no wall");
    expect(world.flapAt(DIM, wall)).toBeUndefined();
    expect(
      world.flapAt(asDimensionId("minecraft:nether"), wall),
    ).toBeUndefined();
    expect(blocks.laidBlockOwner).toHaveBeenCalledWith(
      DIM,
      wall,
      TENT_FLAP_BLOCK,
    );
  });

  it("finds the flap through the laid owner, and nothing once that tent has left the registry (ADR 0132)", () => {
    const { world, blocks } = fixture([ENTRY]);
    const cell = defined(flapCells(POSE, "bedroom")[0], "bedroom flap cell");
    blocks.laidBlockOwner.mockReturnValue(TENT as never);
    expect(world.flapAt(DIM, cell)).toEqual({ tentId: TENT, flap: "bedroom" });
    blocks.laidBlockOwner.mockReturnValue(asTentId("gone") as never);
    expect(world.flapAt(DIM, cell)).toBeUndefined();
  });

  it("ignores a neighbouring body and retains exact unit-cell queries (ADR 0212)", () => {
    const { dimension, world, player } = fixture([ENTRY]);
    const cell = defined(flapCells(POSE, "left")[0], "left flap cell");
    // Feet outside the cell still have a body overlapping its west edge.
    player.location = { x: cell.x - 0.25, y: cell.y, z: cell.z + 0.5 };
    dimension.getPlayers.mockImplementation((q) => {
      const box = q as { location: Vec3; volume: Vec3 };
      return (["x", "y", "z"] as const).every(
        (k) =>
          player.location[k] >= box.location[k] &&
          player.location[k] < box.location[k] + box.volume[k],
      )
        ? [player]
        : [];
    });
    expect(world.clearPlayersForClose(TENT, "left")).toBe(true);
    expect(player.teleport).not.toHaveBeenCalled();
    for (const at of flapCells(POSE, "left")) {
      const box = { location: at, volume: { x: 1, y: 1, z: 1 } };
      expect(dimension.getPlayers).toHaveBeenCalledWith(box);
      expect(dimension.getEntities).toHaveBeenCalledWith({
        ...box,
        families: ["mob"],
      });
    }
  });

  it.each([0, 90, 180, -90] as const)(
    "moves players in every flap cell to their side at yaw %s without changing height or facing",
    (yaw) => {
      const pose = { ...POSE, yaw };
      for (const flap of ["front", "bedroom", "left", "right"] as const) {
        for (const cell of flapCells(pose, flap)) {
          for (const sign of [-1, 1]) {
            const { dimension, world, player } = fixture([{ ...ENTRY, pose }]);
            const depth = flap === "front" || flap === "bedroom";
            const step = tentCellAt(pose, {
              x: depth ? 0 : 1,
              depth: depth ? 1 : 0,
              layer: 0,
            });
            const normal = { x: step.x - pose.x, z: step.z - pose.z };
            player.location = {
              x: cell.x + 0.5 + sign * normal.x * 0.24,
              y: cell.y + 0.125,
              z: cell.z + 0.5 + sign * normal.z * 0.24,
            };
            dimension.getPlayers.mockImplementation((q) =>
              cellKey((q as { location: Vec3 }).location) === cellKey(cell)
                ? [player]
                : [],
            );
            dimension.getBlock.mockReturnValue({ typeId: "minecraft:air" });
            expect(world.clearPlayersForClose(TENT, flap)).toBe(true);
            expect(player.teleport).toHaveBeenCalledExactlyOnceWith(
              {
                x: cell.x + sign * normal.x + 0.5,
                y: player.location.y,
                z: cell.z + sign * normal.z + 0.5,
              },
              { keepVelocity: false, rotation: player.getRotation() },
            );
            expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
          }
        }
      }
    },
  );

  function closingFixture(flap: FlapId = "bedroom") {
    const f = fixture([ENTRY]);
    const cell = defined(flapCells(POSE, flap)[0], "flap cell");
    f.player.location = { x: cell.x + 0.5, y: cell.y + 0.125, z: cell.z + 0.5 };
    f.dimension.getPlayers.mockImplementation((q) =>
      cellKey((q as { location: Vec3 }).location) === cellKey(cell)
        ? [f.player]
        : [],
    );
    return { ...f, cell };
  }

  it("moves the live bedroom position farther inside instead of refusing", () => {
    const pose = { x: 0, y: -60, z: 5, yaw: 180 as const };
    const { world, dimension, player } = fixture([{ ...ENTRY, pose }]);
    player.location = { x: 0.67, y: -60, z: 10.74 };
    dimension.getPlayers.mockImplementation((q) =>
      cellKey((q as { location: Vec3 }).location) === "0,-60,10"
        ? [player]
        : [],
    );
    dimension.getBlock.mockReturnValue({ typeId: "minecraft:air" });
    expect(world.clearPlayersForClose(TENT, "bedroom")).toBe(true);
    expect(player.teleport).toHaveBeenCalledExactlyOnceWith(
      { x: 0.5, y: -60, z: 11.5 },
      { keepVelocity: false, rotation: player.getRotation() },
    );
  });

  it.each(["feet", "head"])(
    "tries the opposite side when preferred %s block is solid",
    (blocked) => {
      const { world, dimension, player, cell } = closingFixture();
      // At yaw 180 depth increases toward +z; a centre tie prefers the bedroom.
      dimension.getBlock.mockImplementation((at: Vec3) => ({
        typeId:
          at.z === cell.z + 1 && at.y === cell.y + (blocked === "head" ? 1 : 0)
            ? "minecraft:stone"
            : "minecraft:air",
      }));
      expect(world.clearPlayersForClose(TENT, "bedroom")).toBe(true);
      expect(player.teleport).toHaveBeenCalledExactlyOnceWith(
        { x: cell.x + 0.5, y: player.location.y, z: cell.z - 0.5 },
        { keepVelocity: false, rotation: player.getRotation() },
      );
    },
  );

  it.each([true, false])(
    "accepts a target flap only when its open state is %s",
    (open) => {
      const { world, dimension, player, cell } = closingFixture();
      dimension.getBlock.mockReturnValue({
        typeId: TENT_FLAP_BLOCK,
        permutation: {
          getAllStates: vi.fn(() => ({ [TENT_OPEN_STATE]: open })),
        },
      });
      expect(world.clearPlayersForClose(TENT, "bedroom")).toBe(open);
      if (open)
        expect(player.teleport).toHaveBeenCalledExactlyOnceWith(
          { x: cell.x + 0.5, y: player.location.y, z: cell.z + 1.5 },
          { keepVelocity: false, rotation: player.getRotation() },
        );
      else expect(player.teleport).not.toHaveBeenCalled();
    },
  );

  it.each(["solid", "unloaded", "throwing"])(
    "refuses with no moves when both exits are %s",
    (blocked) => {
      const { world, dimension, player } = closingFixture();
      dimension.getBlock.mockImplementation(() => {
        if (blocked === "throwing") throw new Error("unloaded");
        return blocked === "solid" ? { typeId: "minecraft:stone" } : undefined;
      });
      expect(world.clearPlayersForClose(TENT, "bedroom")).toBe(false);
      expect(player.teleport).not.toHaveBeenCalled();
    },
  );

  it.each(["mob", "blocked player"])(
    "moves nobody when a later flap cell contains a %s",
    (blocker) => {
      const { world, dimension, player, cell } = closingFixture("front");
      const last = defined(flapCells(POSE, "front").at(-1), "last flap cell");
      const other = {
        ...player,
        id: "other",
        location: { x: last.x + 0.5, y: last.y, z: last.z + 0.5 },
        teleport: vi.fn(),
      };
      dimension.getBlock.mockImplementation((at: Vec3) => ({
        typeId:
          blocker === "blocked player" && at.x === last.x
            ? "minecraft:stone"
            : "minecraft:air",
      }));
      dimension.getPlayers.mockImplementation((q) => {
        const key = cellKey((q as { location: Vec3 }).location);
        return key === cellKey(cell)
          ? [player]
          : blocker === "blocked player" && key === cellKey(last)
            ? [other]
            : [];
      });
      dimension.getEntities.mockImplementation((q) => {
        const query = q as { location: Vec3; families?: string[] };
        return blocker === "mob" &&
          cellKey(query.location) === cellKey(last) &&
          query.families?.includes("mob")
          ? [{}]
          : [];
      });
      expect(world.clearPlayersForClose(TENT, "front")).toBe(false);
      expect(player.teleport).not.toHaveBeenCalled();
      expect(other.teleport).not.toHaveBeenCalled();
    },
  );

  it("clears every player before closing and ignores items", () => {
    const { world, dimension, player, cell } = closingFixture("front");
    const other = { ...player, id: "other", teleport: vi.fn() };
    dimension.getPlayers.mockImplementation((q) =>
      cellKey((q as { location: Vec3 }).location) === cellKey(cell)
        ? [player, other]
        : [],
    );
    dimension.getBlock.mockReturnValue({ typeId: "minecraft:air" });
    // An item does not match the mob-family query.
    dimension.getEntities.mockImplementation((q) =>
      (q as { families?: string[] }).families?.includes("mob") ? [] : [{}],
    );
    expect(world.clearPlayersForClose(TENT, "front")).toBe(true);
    expect(player.teleport).toHaveBeenCalledOnce();
    expect(other.teleport).toHaveBeenCalledOnce();
    expect(world.clearPlayersForClose(asTentId("gone"), "front")).toBe(true);
  });

  it("builds the loaded tent's flaps once, shows the blocked hint, and forgets them on take-down (ADR 0132)", () => {
    const { flaps, player, tent, world } = fixture([ENTRY]);
    const built = world.flapsOf(TENT);
    expect(built).toBeDefined();
    expect(world.flapsOf(TENT)).toBe(built);
    expect(world.flapsOf(asTentId("other"))).toBeUndefined();
    const forget = vi.spyOn(flaps, "forget");
    world.takeDown(TENT);
    expect(forget).toHaveBeenCalledWith(TENT);
    expect(flaps.flapsOf(tent as never)).not.toBe(built);
    world.showFlapBlocked(asPlayerId("player"));
    expect(player.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
      translate: FLAP_BLOCKED_HINT,
    });
  });

  it("reads a block's type, and owns only the add-on's blocks", () => {
    const { dimension, world } = fixture();
    const at = { x: 1, y: 2, z: 3 };
    dimension.getBlock.mockReturnValueOnce({ typeId: TENT_WALL_BLOCK });
    expect(world.isOwnBlock(DIM, at)).toBe(true);
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:stone" });
    expect(world.isOwnBlock(DIM, at)).toBe(false);
    dimension.getBlock.mockReturnValueOnce(undefined);
    expect(world.isOwnBlock(DIM, at)).toBe(false);
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:stone" });
    expect(world.typeIdAt(DIM, at)).toBe("minecraft:stone");
    expect(dimension.getBlock).toHaveBeenLastCalledWith(at);
  });

  it("reads nothing in an unknown dimension", () => {
    const { dimension, world } = fixture();
    game.getDimension.mockImplementation(() => {
      throw new Error("unknown dimension");
    });
    const elsewhere = asDimensionId("yasu_ride:nowhere");
    expect(world.typeIdAt(elsewhere, { x: 0, y: 0, z: 0 })).toBeUndefined();
    expect(world.isOwnBlock(elsewhere, { x: 0, y: 0, z: 0 })).toBe(false);
    const survey = world.survey(elsewhere, POSE);
    expect(survey.clear.every((c) => c === undefined)).toBe(true);
    expect(survey.ground.every((g) => g === undefined)).toBe(true);
    expect(survey.occupants).toBe(0);
    world.clearDecorations(elsewhere, [{ x: 0, y: 0, z: 0 }]);
    expect(dimension.getBlock).not.toHaveBeenCalled();
    expect(dimension.getEntities).not.toHaveBeenCalled();
  });

  it("reads unloaded ground as unreadable, and counts no occupants when the entity query throws", () => {
    const { dimension, world } = fixture();
    dimension.getBlock.mockReturnValue(undefined);
    dimension.getEntities.mockImplementation(() => {
      throw new Error("unloaded");
    });
    const survey = world.survey(DIM, POSE);
    expect(survey.ground.every((g) => g === undefined)).toBe(true);
    expect(survey.occupants).toBe(0);
  });

  it("answers a laid block's owner from the layer without the registry", () => {
    const { blocks, registry, world } = fixture([ENTRY]);
    const other = asTentId("other");
    blocks.laidBlockOwner.mockReturnValueOnce(other as never);
    const cell = { x: 1, y: 2, z: 3 };
    expect(world.tentBlockOwner(DIM, cell, TENT_WALL_BLOCK)).toBe(other);
    expect(registry.all).not.toHaveBeenCalled();
  });

  it("reads Creative, takes one held tent item, and gives one back, only for a player", () => {
    const { container, player, world } = fixture();
    const id = asPlayerId("player");
    expect(world.isCreative(id)).toBe(false);
    player.getGameMode.mockReturnValue("Creative");
    expect(world.isCreative(id)).toBe(true);
    container.getItem.mockReturnValueOnce({ typeId: TENT_ITEM, amount: 2 });
    expect(world.consumeTentItem(id, 3)).toBe(true);
    expect(container.getItem).toHaveBeenLastCalledWith(3);
    expect(container.setItem).toHaveBeenLastCalledWith(3, {
      typeId: TENT_ITEM,
      amount: 1,
    });
    container.getItem.mockReturnValueOnce({
      typeId: "minecraft:stone",
      amount: 1,
    });
    expect(world.consumeTentItem(id, 3)).toBe(false);
    world.giveTentItem(id);
    expect(container.addItem).toHaveBeenCalledExactlyOnceWith({
      typeId: TENT_ITEM,
      amount: 1,
    });
    // The tent entity is no player, and a missing entity is none either.
    for (const notPlayer of [asPlayerId(TENT), asPlayerId("gone")]) {
      expect(world.isCreative(notPlayer)).toBe(false);
      expect(world.consumeTentItem(notPlayer, 0)).toBe(false);
      world.giveTentItem(notPlayer);
    }
    expect(container.addItem).toHaveBeenCalledTimes(1);
    expect(container.getItem).toHaveBeenCalledTimes(2);
  });

  it("clears decorations to air, skipping an unloaded cell and one that refuses the change", () => {
    const { dimension, world } = fixture();
    const cells = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];
    const setTypes = new Map<string, ReturnType<typeof vi.fn>>();
    dimension.getBlock.mockImplementation(
      (c: { x: number; y: number; z: number }) => {
        if (c.x === 1) return undefined;
        if (c.x === 2) throw new Error("unloaded");
        const setType = vi.fn(() => {
          if (c.x === 0) throw new Error("changed since the survey");
        });
        setTypes.set(cellKey(c), setType);
        return { typeId: "minecraft:short_grass", setType };
      },
    );
    world.clearDecorations(DIM, cells);
    expect(dimension.getBlock).toHaveBeenCalledTimes(4);
    for (const x of [0, 3])
      expect(setTypes.get(cellKey({ x, y: 0, z: 0 }))).toHaveBeenCalledWith(
        "minecraft:air",
      );
  });

  it("drops no item for a tent with neither an entity nor an entry", () => {
    const { dimension, world } = fixture();
    world.returnTentItem(asTentId("gone"), undefined);
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });
});
