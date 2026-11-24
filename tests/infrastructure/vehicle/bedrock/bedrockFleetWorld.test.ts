import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { BedrockFleetWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockFleetWorld";
import { BedrockVehicleWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockVehicleWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  ENTITY_TYPE,
  ITEM_TYPE,
  OWNER_PROPERTY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import type { VehicleReleaser } from "../../../../src/infrastructure/vehicle/bedrock/vehicleReleaser";
import {
  campingGearItem,
  isStandableRoomBlock,
} from "../../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";
import {
  fakeVehicleEntities,
  bedrockVehicleGame as game,
} from "../../../support/bedrockVehicleMocks";
import { blockGrid } from "../../../support/blockGrid";
import { decorItemId } from "../../../support/decorIds";
import { createDockBlocks } from "../../../support/dockBlocks";

vi.mock("@minecraft/server", async () =>
  (await import("../../../support/bedrockVehicleMocks")).bedrockVehicleEngine(),
);

function fixture(gearItemType = campingGearItem) {
  const { car, dimension, entities } = fakeVehicleEntities();
  const inputs = new VehicleTestStore<RawInput>();
  const index = new EntityIndex();
  const world = new BedrockVehicleWorld(
    index,
    inputs,
    new VehicleTestStore<string>(),
    noCampSpace,
    createDockBlocks(noCampSpace),
    {},
    isStandableRoomBlock,
  );
  const inventory = { giveItems: vi.fn() };
  return {
    inventory,
    index,
    inputs,
    entities,
    dimension,
    car,
    world,
    fleet: new BedrockFleetWorld(
      index,
      world.releaser,
      inventory,
      gearItemType,
    ),
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
      campingGearItem,
    );
    expect(() => fleet.removeVehicle(asVehicleId(car.id))).toThrow("x");
    expect(car.remove).not.toHaveBeenCalled();
  });

  it("returns decor to the player through the supplied item mapper (ADR 0093)", () => {
    const { fleet, inventory } = fixture((gear) => `test:${gear}`);
    fleet.giveDecorItems(asPlayerId("p"), [decorItemId("percolator")]);
    expect(inventory.giveItems).toHaveBeenCalledExactlyOnceWith("p", [
      "test:percolator",
    ]);
  });
});

const noCampSpace: SpaceCheck = () => false;
