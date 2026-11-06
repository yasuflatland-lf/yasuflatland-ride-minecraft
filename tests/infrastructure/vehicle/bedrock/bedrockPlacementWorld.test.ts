import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import { asDimensionId, asPlayerId } from "../../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import type { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPlacementWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPlacementWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { ITEM_TYPE } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture(campSpace: SpaceCheck = noCampSpace) {
  const dimension = { getBlock: vi.fn(), spawnEntity: vi.fn() };
  game.getDimension.mockImplementation((id: string) => {
    if (id !== "overworld") throw new Error(`unknown dimension ${id}`);
    return dimension;
  });
  const consumeHeld = vi.fn();
  const giveVehicleItem = vi.fn();
  const receivedGift = vi.fn();
  const giveGift = vi.fn();
  const markGiftReceived = vi.fn();
  const inventory = {
    consumeHeld,
    giveVehicleItem,
    receivedGift,
    giveGift,
    markGiftReceived,
  } as unknown as BedrockInventory;
  return {
    dimension,
    consumeHeld,
    giveVehicleItem,
    receivedGift,
    giveGift,
    markGiftReceived,
    placement: new BedrockPlacementWorld(
      inventory,
      new EntityIndex(),
      campSpace,
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

  it("delegates the gift flag, give, and mark to the inventory", () => {
    const { receivedGift, giveGift, markGiftReceived, placement } = fixture();
    receivedGift.mockReturnValue(true);
    const player = asPlayerId("player");
    expect(placement.receivedGift(player, "camping_gear_box")).toBe(true);
    placement.giveGift(player, "camping_gear_box");
    placement.markGiftReceived(player, "camping_gear_box");
    for (const stub of [receivedGift, giveGift, markGiftReceived])
      expect(stub).toHaveBeenCalledExactlyOnceWith(
        "player",
        "camping_gear_box",
      );
  });
});

const noCampSpace: SpaceCheck = () => false;

it.each([true, false])(
  "forwards the camp space query and its answer %s (ADR 0129)",
  (answer) => {
    const check = vi.fn(() => answer);
    const { placement } = fixture(check);
    const dim = asDimensionId("nether");
    const at = { x: 3, y: 64, z: -7 };
    expect(placement.isCampSpace(dim, at)).toBe(answer);
    expect(check).toHaveBeenCalledExactlyOnceWith(dim, at);
  },
);

it.each(VEHICLE_KINDS)(
  "refunds a %s through the inventory-or-feet helper",
  (kind) => {
    const { placement, giveVehicleItem } = fixture();
    placement.refundVehicleItem(asPlayerId("player"), 4, kind);
    expect(giveVehicleItem).toHaveBeenCalledExactlyOnceWith("player", kind);
  },
);

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
