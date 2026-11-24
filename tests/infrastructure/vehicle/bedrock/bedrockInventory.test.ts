import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
  GIFT_RECEIVED_PROPERTY,
  ITEM_TYPE,
  PLAYER_TYPE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
    setLore(lore: unknown[]) {
      Object.assign(this, { lore });
    }
  },
}));

function fixture() {
  const container = { getItem: vi.fn(), setItem: vi.fn(), addItem: vi.fn() };
  const dimension = { spawnItem: vi.fn() };
  const player = {
    id: "player",
    location: { x: 4, y: 70, z: -9 },
    dimension,
    typeId: PLAYER_TYPE,
    selectedSlotIndex: 3,
    getComponent: vi.fn((name: string): unknown =>
      name === "minecraft:inventory" ? { container } : undefined,
    ),
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === player.id ? player : undefined,
  );
  return {
    container,
    dimension,
    player,
    inventory: new BedrockInventory(new EntityIndex()),
  };
}

describe("BedrockInventory", () => {
  const missing = asPlayerId("nobody");
  beforeEach(() => vi.resetAllMocks());

  it("does not take an item from a missing player", () => {
    const { container, inventory } = fixture();
    expect(inventory.consumeHeld(asPlayerId("nobody"), "yasu_ride:x", 0)).toBe(
      false,
    );
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it("uses the selected slot when no slot is given", () => {
    const { container, inventory } = fixture();
    container.getItem.mockReturnValue({ typeId: "yasu_ride:x", amount: 1 });
    expect(inventory.consumeHeld(asPlayerId("player"), "yasu_ride:x")).toBe(
      true,
    );
    expect(container.getItem).toHaveBeenCalledWith(3);
    expect(container.setItem).toHaveBeenCalledWith(3, undefined);
  });

  it.each(VEHICLE_KINDS)("puts one %s item in the inventory", (kind) => {
    const { container, inventory } = fixture();
    inventory.giveVehicleItem(asPlayerId("player"), kind);
    expect(container.addItem).toHaveBeenCalledExactlyOnceWith({
      typeId: ITEM_TYPE[kind],
      amount: 1,
    });
  });

  it("gives one of each requested decor item in order (ADR 0093)", () => {
    const { container, inventory } = fixture();
    inventory.giveItems(asPlayerId("player"), [
      "yasu_ride:percolator",
      "yasu_ride:toaster",
    ]);
    expect(container.addItem.mock.calls).toEqual([
      [{ typeId: "yasu_ride:percolator", amount: 1 }],
      [{ typeId: "yasu_ride:toaster", amount: 1 }],
    ]);
  });

  it("reports no gift flag for a missing player", () => {
    const { inventory } = fixture();
    expect(
      inventory.receivedGift(asPlayerId("nobody"), "camping_gear_box"),
    ).toBeUndefined();
  });

  it("reports the gift flag only when it is exactly true", () => {
    fc.assert(
      fc.property(fc.constantFrom(true, false, undefined, "true"), (stored) => {
        const { player, inventory } = fixture();
        player.getDynamicProperty.mockReturnValue(stored);
        expect(
          inventory.receivedGift(asPlayerId("player"), "camping_gear_box"),
        ).toBe(stored === true);
        expect(player.getDynamicProperty).toHaveBeenCalledWith(
          GIFT_RECEIVED_PROPERTY.camping_gear_box,
        );
      }),
    );
    expect(GIFT_RECEIVED_PROPERTY.camping_gear_box).toBe(
      "yasu_ride:camping_gear_given",
    );
  });

  it("marks the gift as received on a present player", () => {
    const { player, inventory } = fixture();
    inventory.markGiftReceived(asPlayerId("player"), "camping_gear_box");
    expect(player.setDynamicProperty).toHaveBeenCalledTimes(1);
    expect(player.setDynamicProperty).toHaveBeenCalledWith(
      "yasu_ride:camping_gear_given",
      true,
    );
  });

  it("puts one camping gear box in the inventory", () => {
    const { container, inventory } = fixture();
    inventory.giveGift(asPlayerId("player"), "camping_gear_box");
    expect(container.addItem).toHaveBeenCalledTimes(1);
    expect(container.addItem).toHaveBeenCalledWith({
      typeId: "yasu_ride:camping_gear_box",
      amount: 1,
    });
  });

  it("takes the gift box only from the given slot", () => {
    const { container, inventory } = fixture();
    container.getItem.mockImplementation((slot: number) =>
      slot === 4
        ? { typeId: GIFT_ITEM.camping_gear_box, amount: 1 }
        : undefined,
    );
    expect(
      inventory.consumeGift(asPlayerId("player"), "camping_gear_box", 4),
    ).toBe(true);
    expect(container.getItem).toHaveBeenCalledWith(4);
    expect(container.setItem).toHaveBeenCalledWith(4, undefined);
    container.getItem.mockImplementation((slot: number) =>
      slot === 4 ? { typeId: "minecraft:stick", amount: 1 } : undefined,
    );
    expect(
      inventory.consumeGift(asPlayerId("player"), "camping_gear_box", 4),
    ).toBe(false);
  });

  it("unpacks every gear item once, in order, with the camping gear lore line", () => {
    const { container, inventory } = fixture();
    inventory.unpackGift(asPlayerId("player"), "camping_gear_box");
    expect(container.addItem.mock.calls).toEqual(
      GIFT_CONTENTS.camping_gear_box.map((typeId) => [
        {
          typeId,
          amount: 1,
          lore: [{ translate: "yasu_ride.lore.camping_gear" }],
        },
      ]),
    );
    expect(container.addItem).toHaveBeenCalledTimes(
      GIFT_CONTENTS.camping_gear_box.length,
    );
  });

  it.each<[string, (inventory: BedrockInventory) => void]>([
    [
      "markGiftReceived",
      (inventory) => inventory.markGiftReceived(missing, "camping_gear_box"),
    ],
    [
      "giveVehicleItem",
      (inventory) => inventory.giveVehicleItem(missing, "suv"),
    ],
    [
      "giveItems",
      (inventory) => inventory.giveItems(missing, ["yasu_ride:percolator"]),
    ],
    [
      "unpackGift",
      (inventory) => inventory.unpackGift(missing, "camping_gear_box"),
    ],
  ])("%s skips writes for a missing player", (_method, write) => {
    const { player, container, dimension, inventory } = fixture();
    write(inventory);
    expect(player.setDynamicProperty).not.toHaveBeenCalled();
    expect(container.addItem).not.toHaveBeenCalled();
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });
});
