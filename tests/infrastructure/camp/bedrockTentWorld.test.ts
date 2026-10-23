import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../src/application/shared/ports/space";
import {
  asTentId,
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
import { BedrockTentWorld } from "../../../src/infrastructure/camp/bedrock/bedrockTentWorld";
import { TENT_CELL_CODEC } from "../../../src/infrastructure/camp/bedrock/tentBlocks";
import {
  PITCH_REFUSAL_MESSAGE,
  TENT_CEILING_BLOCK,
  TENT_ITEM,
  TENT_TYPE,
  TENT_WALL_BLOCK,
} from "../../../src/infrastructure/camp/identifiers";
import type { DynamicPropertyTentRegistry } from "../../../src/infrastructure/camp/persistence/tentRegistry";
import type { CellLayer } from "../../../src/infrastructure/shared/laidCells";

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
    getEntities: vi.fn(() => [] as unknown[]),
    getPlayers: vi.fn(() => [] as unknown[]),
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
    remove: vi.fn(() => order.push("remove")),
  };
  const container = { addItem: vi.fn(() => undefined) };
  const player = {
    id: "player",
    typeId: "minecraft:player",
    isValid: true,
    location: { x: 0, y: 0, z: 0 },
    dimension,
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
  const world = new BedrockTentWorld({
    isVehicleSpace,
    registry: registry as unknown as DynamicPropertyTentRegistry,
    blocks: blocks as unknown as CellLayer<never, never>,
  });
  return {
    dimension,
    tent,
    player,
    container,
    registry,
    blocks,
    isVehicleSpace,
    world,
    order,
  };
}

const ENTRY: TentEntry = { id: TENT, dimensionId: DIM, pose: POSE };

describe("BedrockTentWorld (ADR 0131)", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(survey.clear).toHaveLength(336);
    expect(survey.ground).toHaveLength(84);
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
    const wall = tentCells(POSE).find((c) => c.block.type === "wall");
    const ceiling = tentCells(POSE).find((c) => c.block.type === "ceiling");
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
    expect(world.isOccupied(TENT)).toBe(false);
    expect(world.isOccupied(asTentId("other"))).toBe(false);
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
    const cells = tentCells(POSE);
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
    expect(registry.add).toHaveBeenCalledWith(ENTRY);
    expect(blocks.lay).toHaveBeenCalledWith(TENT, tent, tentCells(POSE));
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
});
