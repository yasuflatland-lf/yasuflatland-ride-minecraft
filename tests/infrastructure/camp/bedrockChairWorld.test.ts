import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asChairId } from "../../../src/domain/camp/chair";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockChairWorld } from "../../../src/infrastructure/camp/bedrock/bedrockChairWorld";
import {
  HITS_LEFT_HINT,
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
} from "../../../src/infrastructure/camp/identifiers";

const game = vi.hoisted(() => ({ getDimension: vi.fn(), getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Creative: "Creative", Survival: "Survival" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));

const DIM = asDimensionId("overworld");

function fixture() {
  const dimension = {
    getBlock: vi.fn(),
    getEntities: vi.fn(() => [] as unknown[]),
    spawnEntity: vi.fn(),
    spawnItem: vi.fn(),
  };
  const riders: unknown[] = [];
  const chair = {
    id: "chair",
    typeId: LOW_CHAIR_TYPE,
    isValid: true,
    location: { x: 1.5, y: 64, z: 2.5 },
    dimension,
    remove: vi.fn(),
    setRotation: vi.fn(),
    getComponent: vi.fn((name: string) =>
      name === "minecraft:rideable" ? { getRiders: () => riders } : undefined,
    ),
  };
  const container = { getItem: vi.fn(), setItem: vi.fn() };
  const player = {
    id: "player",
    typeId: "minecraft:player",
    isValid: true,
    getGameMode: vi.fn(() => "Survival"),
    getComponent: vi.fn(() => ({ container })),
    onScreenDisplay: { setActionBar: vi.fn() },
  };
  game.getDimension.mockReturnValue(dimension);
  game.getEntity.mockImplementation((id: string) =>
    id === chair.id ? chair : id === player.id ? player : undefined,
  );
  const isVehicleSpace = vi.fn(() => false);
  return {
    dimension,
    chair,
    riders,
    container,
    player,
    isVehicleSpace,
    chairs: new BedrockChairWorld({ isVehicleSpace }),
  };
}

describe("BedrockChairWorld (ADR 0122)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("counts only this add-on's blocks as its own", () => {
    const { dimension, chairs } = fixture();
    dimension.getBlock.mockReturnValueOnce({
      typeId: "yasu_ride:camper_floor",
    });
    expect(chairs.isOwnBlock(DIM, { x: 0, y: 0, z: 0 })).toBe(true);
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:grass_block" });
    expect(chairs.isOwnBlock(DIM, { x: 0, y: 0, z: 0 })).toBe(false);
    dimension.getBlock.mockImplementationOnce(() => {
      throw new Error("outside the world");
    });
    expect(chairs.isOwnBlock(DIM, { x: 0, y: 999, z: 0 })).toBe(false);
  });

  it("asks the vehicles for their space", () => {
    const { chairs, isVehicleSpace } = fixture();
    isVehicleSpace.mockReturnValue(true);
    expect(chairs.isVehicleSpace(DIM, { x: 1, y: 2, z: 3 })).toBe(true);
    expect(isVehicleSpace).toHaveBeenCalledWith(DIM, { x: 1, y: 2, z: 3 });
  });

  // The engine's distance query, over one chair at `at`.
  function oneChairAt(at: { x: number; y: number; z: number }) {
    const { dimension, chair, chairs } = fixture();
    chair.location = at;
    dimension.getEntities.mockImplementation(((query: {
      type: string;
      location: { x: number; y: number; z: number };
      maxDistance: number;
    }) =>
      query.type === LOW_CHAIR_TYPE &&
      Math.hypot(
        at.x - query.location.x,
        at.y - query.location.y,
        at.z - query.location.z,
      ) <= query.maxDistance
        ? [chair]
        : []) as never);
    return chairs;
  }

  it("finds a chair of the cell wherever it settled, up to a block down", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -60, max: 300 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x, y, z, fall) => {
          const chairs = oneChairAt({ x: x + 0.5, y: y - fall, z: z + 0.5 });
          expect(chairs.hasChairAt(DIM, { x, y, z })).toBe(true);
        },
      ),
    );
  });

  it("ignores a chair of a cell beside it wherever that chair settled", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -60, max: 300 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom([1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]),
        (x, y, z, fall, [dx, dz]) => {
          const chairs = oneChairAt({
            x: x + dx + 0.5,
            y: y - fall,
            z: z + dz + 0.5,
          });
          expect(chairs.hasChairAt(DIM, { x, y, z })).toBe(false);
        },
      ),
    );
  });

  it("spawns the chair turned to the yaw", () => {
    const { dimension, chair, chairs } = fixture();
    dimension.spawnEntity.mockReturnValue(chair);
    chairs.spawnChair(DIM, { x: 1.5, y: 64, z: 2.5 }, 135);
    expect(dimension.spawnEntity).toHaveBeenCalledWith(LOW_CHAIR_TYPE, {
      x: 1.5,
      y: 64,
      z: 2.5,
    });
    expect(chair.setRotation).toHaveBeenCalledWith({ x: 0, y: 135 });
  });

  it("is occupied while it has a rider", () => {
    const { chairs, riders } = fixture();
    expect(chairs.isOccupied(asChairId("chair"))).toBe(false);
    riders.push({});
    expect(chairs.isOccupied(asChairId("chair"))).toBe(true);
  });

  it("drops one chair item where the chair stands and removes it", () => {
    const { dimension, chair, chairs } = fixture();
    chairs.dropChairItem(asChairId("chair"));
    chairs.removeChair(asChairId("chair"));
    expect(dimension.spawnItem).toHaveBeenCalledWith(
      { typeId: LOW_CHAIR_ITEM, amount: 1 },
      chair.location,
    );
    expect(chair.remove).toHaveBeenCalled();
  });

  it("ignores ids that are not chairs", () => {
    const { dimension, chairs } = fixture();
    chairs.dropChairItem(asChairId("player"));
    chairs.removeChair(asChairId("gone"));
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });

  it("takes the chair item only from the slot that still holds it", () => {
    const { container, chairs } = fixture();
    container.getItem.mockReturnValueOnce({
      typeId: LOW_CHAIR_ITEM,
      amount: 1,
    });
    expect(chairs.consumeChairItem(asPlayerId("player"), 4)).toBe(true);
    expect(container.setItem).toHaveBeenCalledWith(4, undefined);
    container.getItem.mockReturnValueOnce({
      typeId: "minecraft:dirt",
      amount: 1,
    });
    expect(chairs.consumeChairItem(asPlayerId("player"), 4)).toBe(false);
    expect(chairs.consumeChairItem(asPlayerId("nobody"), 4)).toBe(false);
  });

  it("shows how many hits are left", () => {
    const { player, chairs } = fixture();
    chairs.showHitsLeft(asPlayerId("player"), 2);
    expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledWith({
      translate: HITS_LEFT_HINT,
      with: ["2"],
    });
  });
});
