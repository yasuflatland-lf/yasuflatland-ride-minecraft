import { beforeEach, describe, expect, it, vi } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import type { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPlacementWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPlacementWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { ITEM_TYPE } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const dimension = { getBlock: vi.fn() };
  game.getDimension.mockImplementation((id: string) => {
    if (id !== "overworld") throw new Error(`unknown dimension ${id}`);
    return dimension;
  });
  const consumeHeld = vi.fn();
  const inventory = { consumeHeld } as unknown as BedrockInventory;
  return {
    dimension,
    consumeHeld,
    placement: new BedrockPlacementWorld(inventory, new EntityIndex()),
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
    expect(placement.isAir("overworld", at)).toBe(expected);
    expect(dimension.getBlock).toHaveBeenCalledExactlyOnceWith(at);
  });

  it("treats an unknown dimension or an unloaded cell as not air", () => {
    const { dimension, placement } = fixture();
    expect(placement.isAir("nowhere", at)).toBe(false);
    dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded chunk");
    });
    expect(placement.isAir("overworld", at)).toBe(false);
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
    expect(placement.consumeVehicleItem("player", 4, kind)).toBe(taken);
    expect(consumeHeld).toHaveBeenCalledExactlyOnceWith(
      "player",
      ITEM_TYPE[kind],
      4,
    );
  });
});
