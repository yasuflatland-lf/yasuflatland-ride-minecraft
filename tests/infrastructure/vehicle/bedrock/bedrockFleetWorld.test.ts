import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import { BedrockFleetWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockFleetWorld";
import { BedrockVehicleWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockVehicleWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  ENTITY_TYPE,
  ITEM_TYPE,
  OWNER_PROPERTY,
  VEHICLE_FAMILY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import type { VehicleReleaser } from "../../../../src/infrastructure/vehicle/bedrock/vehicleReleaser";
import { TestInputStore } from "../../../../src/infrastructure/vehicle/testInput/testInputStore";
import { blockGrid } from "../../../support/blockGrid";

const game = vi.hoisted(() => ({
  getDimension: vi.fn(),
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  ButtonState: {},
  InputButton: {},
  EntityDamageCause: {},
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number>) => ({
      typeId,
      states,
    }),
  },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));

function fixture() {
  const dimension = {
    getBlock: vi.fn(),
    getPlayers: vi.fn(),
    getEntities: vi.fn(),
    spawnItem: vi.fn(),
    spawnEntity: vi.fn(),
    playSound: vi.fn(),
  };
  const car = {
    id: "car",
    typeId: ENTITY_TYPE.suv,
    families: [VEHICLE_FAMILY],
    isValid: true,
    location: { x: -1.25, y: 64.25, z: 2.75 },
    dimension,
    isOnGround: false,
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: vi.fn((_key: string): unknown => undefined),
    getComponent: vi.fn((_name: string): unknown => undefined),
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
    teleport: vi.fn(),
    clearVelocity: vi.fn(),
    applyImpulse: vi.fn(),
    setRotation: vi.fn(),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
    playAnimation: vi.fn(),
    setProperty: vi.fn(),
  };
  const entities = [car];
  dimension.getEntities.mockImplementation(
    (query: { type?: string; families?: string[] } = {}) =>
      entities.filter(
        (e) =>
          (query.type === undefined || e.typeId === query.type) &&
          (query.families === undefined ||
            query.families.every((family) => e.families.includes(family))),
      ),
  );
  game.getDimension.mockImplementation((id: string) =>
    id === "overworld" ? dimension : { getEntities: () => [] },
  );
  game.getEntity.mockImplementation((id: string) =>
    id === car.id ? car : undefined,
  );
  const inputs = new TestInputStore();
  const index = new EntityIndex();
  const world = new BedrockVehicleWorld(index, inputs, noCampSpace);
  const inventory = { giveItems: vi.fn() };
  return {
    inventory,
    index,
    inputs,
    entities,
    dimension,
    car,
    world,
    fleet: new BedrockFleetWorld(index, world.releaser, inventory),
  };
}

describe("BedrockFleetWorld fleet entries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists the fleet entries of every dimension", () => {
    fc.assert(
      fc.property(fc.subarray(["overworld", "nether", "the_end"]), (dimIds) => {
        const { car, fleet } = fixture();
        const cars = new Map(
          dimIds.map((dimId) => [
            dimId,
            {
              ...car,
              id: `car-${dimId}`,
              typeId: ENTITY_TYPE.sportsboat,
              getDynamicProperty: (key: string) =>
                key === OWNER_PROPERTY ? `owner-${dimId}` : undefined,
            },
          ]),
        );
        game.getDimension.mockImplementation((id: string) => {
          const inDim = cars.get(id);
          return { getEntities: () => (inDim ? [inDim] : []) };
        });
        expect(fleet.loadedFleetEntries()).toEqual(
          dimIds.map((dimId) => ({
            id: `car-${dimId}`,
            kind: "sportsboat",
            owner: `owner-${dimId}`,
          })),
        );
      }),
    );
  });

  it("skips an unknown entity in the vehicle family in fleet entries", () => {
    const { entities, car, fleet } = fixture();
    entities.push({ ...car, id: "unknown", typeId: "yasu_ride:unknown" });
    expect(fleet.loadedFleetEntries()).toEqual([
      { id: car.id, kind: "suv", owner: undefined },
    ]);
  });
});

describe("BedrockFleetWorld drop and removal (ADR 0038, 0063)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("drops the item of the broken entity's kind at its location", () => {
    const { car, dimension, fleet } = fixture();
    fleet.dropVehicleItem(asVehicleId(car.id));
    expect(dimension.spawnItem).toHaveBeenCalledWith(
      expect.objectContaining({ typeId: ITEM_TYPE.suv, amount: 1 }),
      car.location,
    );
  });

  it("drops nothing for a missing entity or an entity of no vehicle kind", () => {
    const { car, entities, dimension, fleet } = fixture();
    game.getEntity.mockImplementation((id: string) =>
      id === "unknown" ? { ...car, typeId: "yasu_ride:unknown" } : undefined,
    );
    entities.length = 0;
    fleet.dropVehicleItem(asVehicleId("missing"));
    fleet.dropVehicleItem(asVehicleId("unknown"));
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });

  it("clears the floor and releases the hold of a removed vehicle", () => {
    const { dimension, world, car, fleet } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = {
      x: 0,
      y: 64,
      z: 3,
      block: { type: "deck" as const, height: 9 },
    };
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    world.loadedVehicles();
    world.holdAt(asVehicleId(car.id), pose);
    world.layDock(asVehicleId(car.id), [cell]);
    expect(grid.typeAt(cell)).toBe(DECK_FLOOR_BLOCK);
    fleet.removeVehicle(asVehicleId(car.id));
    expect(grid.typeAt(cell)).toBe("minecraft:air");
    expect(car.setDynamicProperty).toHaveBeenLastCalledWith(
      DECK_CELLS_PROPERTY,
      undefined,
    );
    expect(car.remove).toHaveBeenCalledOnce();
    world.applyMotion(asVehicleId(car.id), { x: 0, y: 0, z: 1 }, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledOnce();
  });

  it("clears the headlight blocks of a removed vehicle", () => {
    const { dimension, car, world, fleet } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = { x: 0, y: 65, z: 4, level: 15 };
    world.loadedVehicles();
    world.shineHeadlights(asVehicleId(car.id), [cell]);
    expect(grid.typeAt(cell)).toBe("minecraft:light_block_15");
    fleet.removeVehicle(asVehicleId(car.id));
    expect(grid.typeAt(cell)).toBe("minecraft:air");
    expect(car.remove).toHaveBeenCalledOnce();
  });

  it("does not remove the entity when a release step throws", () => {
    const { car, index } = fixture();
    const fleet = new BedrockFleetWorld(
      index,
      {
        release: () => {
          throw new Error("x");
        },
      } as unknown as VehicleReleaser,
      { giveItems: vi.fn() },
    );
    expect(() => fleet.removeVehicle(asVehicleId(car.id))).toThrow("x");
    expect(car.remove).not.toHaveBeenCalled();
  });

  it("gives the decor as camping gear items to the player (ADR 0093)", () => {
    const { fleet, inventory } = fixture();
    fleet.giveDecorItems(asPlayerId("p"), ["percolator"]);
    expect(inventory.giveItems).toHaveBeenCalledExactlyOnceWith("p", [
      "yasu_ride:percolator",
    ]);
  });
});

const noCampSpace: SpaceCheck = () => false;
