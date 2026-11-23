import { beforeEach, describe, expect, it, vi } from "vitest";
import { asDimensionId, asPlayerId } from "../../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import type { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPlacementWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPlacementWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  ENTITY_TYPE,
  ITEM_TYPE,
  OWNER_PROPERTY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const dimension = { getBlock: vi.fn(), spawnEntity: vi.fn() };
  game.getDimension.mockImplementation((id: string) => {
    if (id !== "overworld") throw new Error(`unknown dimension ${id}`);
    return dimension;
  });
  const consumeHeld = vi.fn();
  const inventory = { consumeHeld } as unknown as BedrockInventory;
  return {
    dimension,
    consumeHeld,
    placement: new BedrockPlacementWorld(
      inventory,
      new EntityIndex(),
      () => false,
    ),
  };
}

describe("BedrockPlacementWorld cell queries", () => {
  beforeEach(() => vi.resetAllMocks());

  const at = { x: 3, y: 64, z: -7 };

  it.each([
    [{ typeId: "minecraft:air", isAir: true }, true],
    [{ typeId: "minecraft:light_block_15", isAir: false }, true],
    [{ typeId: "minecraft:stone", isAir: false }, false],
    [undefined, false],
  ])("treats block %o as air: %s", (block, expected) => {
    const { dimension, placement } = fixture();
    dimension.getBlock.mockReturnValue(block);
    expect(placement.isAir(asDimensionId("overworld"), at)).toBe(expected);
    expect(dimension.getBlock).toHaveBeenCalledExactlyOnceWith(at);
  });

  it("treats an unknown dimension or an unloaded cell as not air", () => {
    const { dimension, placement } = fixture();
    expect(placement.isAir(asDimensionId("nowhere"), at)).toBe(false);
    dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded chunk");
    });
    expect(placement.isAir(asDimensionId("overworld"), at)).toBe(false);
  });
});

describe("BedrockPlacementWorld vehicle item", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(
    VEHICLE_KINDS.flatMap((kind) => [
      [kind, true],
      [kind, false],
    ]),
  )("takes one %s item from the given slot (taken: %s)", (kind, taken) => {
    const { consumeHeld, placement } = fixture();
    consumeHeld.mockReturnValue(taken);
    expect(placement.consumeVehicleItem(asPlayerId("player"), 4, kind)).toBe(
      taken,
    );
    expect(consumeHeld).toHaveBeenCalledExactlyOnceWith(
      "player",
      ITEM_TYPE[kind],
      4,
    );
  });
});

describe("BedrockPlacementWorld water query (ADR 0051)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:bubble_column",
  ])(
    "counts %s in the named dimension as water at the floored cell",
    (typeId) => {
      const { dimension, placement } = fixture();
      dimension.getBlock.mockReturnValue({ typeId, isWaterlogged: false });
      expect(
        placement.isWaterAt(asDimensionId("overworld"), {
          x: 1.7,
          y: 64.2,
          z: -0.5,
        }),
      ).toBe(true);
      expect(game.getDimension).toHaveBeenCalledWith("overworld");
      expect(dimension.getBlock).toHaveBeenCalledWith({ x: 1, y: 64, z: -1 });
    },
  );

  it("counts a waterlogged block as water and air or an unloaded cell as dry", () => {
    const { dimension, placement } = fixture();
    dimension.getBlock.mockReturnValueOnce({
      typeId: "minecraft:kelp",
      isWaterlogged: true,
    });
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(true);
    dimension.getBlock.mockReturnValueOnce({
      typeId: "minecraft:air",
      isWaterlogged: false,
    });
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(false);
    dimension.getBlock.mockImplementationOnce(() => {
      throw new Error("unloaded");
    });
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(false);
    dimension.getBlock.mockReturnValueOnce(undefined);
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(false);
  });

  it("is dry in an unknown dimension", () => {
    const { placement } = fixture();
    expect(
      placement.isWaterAt(asDimensionId("nowhere"), { x: 0, y: 0, z: 0 }),
    ).toBe(false);
  });
});

describe("BedrockPlacementWorld spawn result", () => {
  beforeEach(() => vi.resetAllMocks());

  const spawn = (placement: BedrockPlacementWorld) =>
    placement.spawnVehicle(
      asDimensionId("overworld"),
      { x: 0, y: 64, z: 0 },
      45,
      "suv",
      asPlayerId("player"),
    );

  it.each(VEHICLE_KINDS)(
    "records the owner synchronously when spawning a %s",
    (kind) => {
      const { dimension, placement } = fixture();
      const at = { x: 1, y: 64, z: -2 };
      const car = {
        id: "vehicle",
        setRotation: vi.fn(),
        setDynamicProperty: vi.fn(),
      };
      dimension.spawnEntity.mockReturnValue(car);
      const ownerId = asPlayerId("placing-player");
      expect(
        placement.spawnVehicle(
          asDimensionId("overworld"),
          at,
          45,
          kind,
          ownerId,
        ),
      ).toEqual({ status: "spawned", id: car.id });
      expect(dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
        ENTITY_TYPE[kind],
        at,
      );
      expect(car.setRotation).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 45 });
      expect(car.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
        OWNER_PROPERTY,
        ownerId,
      );
    },
  );

  it("reports a failure with no entity when spawnEntity throws", () => {
    const { placement, dimension } = fixture();
    dimension.spawnEntity.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    expect(spawn(placement)).toEqual({ status: "failed", cleaned: true });
  });

  it.each(["setRotation", "setDynamicProperty"] as const)(
    "removes the incomplete entity when %s throws, and reports whether removal succeeded",
    (initialization) => {
      for (const removeFails of [false, true]) {
        const { placement, dimension } = fixture();
        const entity = {
          id: "vehicle",
          setRotation: vi.fn(),
          setDynamicProperty: vi.fn(),
          remove: vi.fn(),
        };
        entity[initialization].mockImplementation(() => {
          throw new Error("initialization failed");
        });
        if (removeFails)
          entity.remove.mockImplementation(() => {
            throw new Error("remove failed");
          });
        dimension.spawnEntity.mockReturnValue(entity);
        expect(spawn(placement)).toEqual({
          status: "failed",
          cleaned: !removeFails,
        });
        expect(entity.remove).toHaveBeenCalledOnce();
        if (initialization === "setRotation")
          expect(entity.setDynamicProperty).not.toHaveBeenCalled();
      }
    },
  );
});
