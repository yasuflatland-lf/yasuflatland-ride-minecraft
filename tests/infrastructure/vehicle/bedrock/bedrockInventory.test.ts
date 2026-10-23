import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { STARTER_KINDS } from "../../../../src/domain/vehicle/placement/starter";
import { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  GIFT_CONTENTS,
  GIFT_ITEM,
  GIFT_RECEIVED_PROPERTY,
  ITEM_TYPE,
  PLAYER_TYPE,
  STARTER_RECEIVED_PROPERTY,
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
  beforeEach(() => vi.resetAllMocks());

  it("does not take an item from a missing player", () => {
    const { container, inventory } = fixture();
    expect(inventory.consumeHeld(asPlayerId("nobody"), "yasu_ride:x", 0)).toBe(
      false,
    );
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it("does not take an item from a player without an inventory", () => {
    const { container, player, inventory } = fixture();
    player.getComponent.mockReturnValue(undefined);
    expect(inventory.consumeHeld(asPlayerId("player"), "yasu_ride:x", 0)).toBe(
      false,
    );
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it("does not take an item from an empty slot", () => {
    const { container, inventory } = fixture();
    container.getItem.mockReturnValue(undefined);
    expect(inventory.consumeHeld(asPlayerId("player"), "yasu_ride:x", 0)).toBe(
      false,
    );
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it("does not take an item of another type", () => {
    const { container, inventory } = fixture();
    container.getItem.mockReturnValue({ typeId: "yasu_ride:y", amount: 1 });
    expect(inventory.consumeHeld(asPlayerId("player"), "yasu_ride:x", 0)).toBe(
      false,
    );
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it("takes one item from a stack", () => {
    const { container, inventory } = fixture();
    const item = { typeId: "yasu_ride:x", amount: 3 };
    container.getItem.mockReturnValue(item);
    expect(inventory.consumeHeld(asPlayerId("player"), "yasu_ride:x", 5)).toBe(
      true,
    );
    expect(item.amount).toBe(2);
    expect(container.setItem).toHaveBeenCalledExactlyOnceWith(5, item);
  });

  it("empties the slot when it held the last item", () => {
    const { container, inventory } = fixture();
    container.getItem.mockReturnValue({ typeId: "yasu_ride:x", amount: 1 });
    expect(inventory.consumeHeld(asPlayerId("player"), "yasu_ride:x", 5)).toBe(
      true,
    );
    expect(container.setItem).toHaveBeenCalledExactlyOnceWith(5, undefined);
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

  it("reports no starter flag for a missing player", () => {
    const { inventory } = fixture();
    expect(
      inventory.receivedStarter(asPlayerId("nobody"), "suv"),
    ).toBeUndefined();
  });

  it("reports the starter flag only when it is exactly true", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STARTER_KINDS),
        fc.constantFrom(true, false, undefined, "true"),
        (kind, value) => {
          const { player, inventory } = fixture();
          player.getDynamicProperty.mockReturnValue(value);
          expect(inventory.receivedStarter(asPlayerId("player"), kind)).toBe(
            value === true,
          );
          expect(player.getDynamicProperty).toHaveBeenCalledWith(
            STARTER_RECEIVED_PROPERTY[kind],
          );
        },
      ),
    );
  });

  it.each(STARTER_KINDS)(
    "marks the starter as received on a present player",
    (kind) => {
      const { player, inventory } = fixture();
      inventory.markStarterReceived(asPlayerId("player"), kind);
      expect(player.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
        STARTER_RECEIVED_PROPERTY[kind],
        true,
      );
    },
  );

  it("does nothing when marking a missing player", () => {
    const { player, inventory } = fixture();
    expect(() =>
      inventory.markStarterReceived(asPlayerId("nobody"), "suv"),
    ).not.toThrow();
    expect(player.setDynamicProperty).not.toHaveBeenCalled();
  });

  it.each(VEHICLE_KINDS)("puts one %s item in the inventory", (kind) => {
    const { container, dimension, inventory } = fixture();
    container.addItem.mockReturnValue(undefined);
    inventory.giveVehicleItem(asPlayerId("player"), kind);
    expect(container.addItem).toHaveBeenCalledExactlyOnceWith({
      typeId: ITEM_TYPE[kind],
      amount: 1,
    });
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });

  it("drops what does not fit in a full inventory at the player", () => {
    const { container, dimension, player, inventory } = fixture();
    const leftover = { typeId: ITEM_TYPE.suv, amount: 1 };
    container.addItem.mockReturnValue(leftover);
    inventory.giveVehicleItem(asPlayerId("player"), "suv");
    expect(dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
      leftover,
      player.location,
    );
  });

  it("drops the item at a player without an inventory", () => {
    const { dimension, player, inventory } = fixture();
    player.getComponent.mockReturnValue(undefined);
    inventory.giveVehicleItem(asPlayerId("player"), "suv");
    expect(dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
      { typeId: ITEM_TYPE.suv, amount: 1 },
      player.location,
    );
  });

  it("gives nothing to a missing player", () => {
    const { container, dimension, inventory } = fixture();
    inventory.giveVehicleItem(asPlayerId("nobody"), "suv");
    expect(container.addItem).not.toHaveBeenCalled();
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });

  describe("giveItems (ADR 0093)", () => {
    it("gives each item into the inventory and drops only what does not fit at the player's feet", () => {
      const { container, dimension, player, inventory } = fixture();
      container.addItem.mockImplementation((item: { typeId: string }) =>
        item.typeId === "yasu_ride:toaster" ? item : undefined,
      );
      inventory.giveItems(asPlayerId("player"), [
        "yasu_ride:percolator",
        "yasu_ride:toaster",
      ]);
      expect(container.addItem.mock.calls).toEqual([
        [{ typeId: "yasu_ride:percolator", amount: 1 }],
        [{ typeId: "yasu_ride:toaster", amount: 1 }],
      ]);
      expect(dimension.spawnItem).toHaveBeenCalledExactlyOnceWith(
        { typeId: "yasu_ride:toaster", amount: 1 },
        player.location,
      );
    });

    it("gives nothing to a missing player", () => {
      const { container, dimension, inventory } = fixture();
      inventory.giveItems(asPlayerId("nobody"), ["yasu_ride:percolator"]);
      expect(container.addItem).not.toHaveBeenCalled();
      expect(dimension.spawnItem).not.toHaveBeenCalled();
    });
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
    player.setDynamicProperty.mockClear();
    expect(() =>
      inventory.markGiftReceived(asPlayerId("nobody"), "camping_gear_box"),
    ).not.toThrow();
    expect(player.setDynamicProperty).not.toHaveBeenCalled();
  });

  it("puts one camping gear box in the inventory", () => {
    const { container, dimension, inventory } = fixture();
    container.addItem.mockReturnValue(undefined);
    inventory.giveGift(asPlayerId("player"), "camping_gear_box");
    expect(container.addItem).toHaveBeenCalledTimes(1);
    expect(container.addItem).toHaveBeenCalledWith({
      typeId: "yasu_ride:camping_gear_box",
      amount: 1,
    });
    expect(dimension.spawnItem).not.toHaveBeenCalled();
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
    const { container, dimension, inventory } = fixture();
    container.addItem.mockReturnValue(undefined);
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
    expect(container.addItem).toHaveBeenCalledTimes(19);
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });

  it("drops each unpacked item that does not fit at the player", () => {
    const { container, dimension, player, inventory } = fixture();
    const count = GIFT_CONTENTS.camping_gear_box.length;
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: count, maxLength: count }),
        (fits) => {
          container.addItem.mockReset();
          dimension.spawnItem.mockClear();
          let i = 0;
          container.addItem.mockImplementation((item: unknown) =>
            fits[i++] ? undefined : item,
          );
          inventory.unpackGift(asPlayerId("player"), "camping_gear_box");
          const items = container.addItem.mock.calls.map(([item]) => item);
          expect(dimension.spawnItem.mock.calls).toEqual(
            items
              .filter((_, k) => !fits[k])
              .map((item) => [item, player.location]),
          );
        },
      ),
    );
  });

  it("unpacks at the feet of a player without an inventory", () => {
    const { dimension, player, inventory } = fixture();
    player.getComponent.mockReturnValue(undefined);
    inventory.unpackGift(asPlayerId("player"), "camping_gear_box");
    expect(dimension.spawnItem).toHaveBeenCalledTimes(19);
  });

  it("unpacks nothing for a missing player", () => {
    const { container, dimension, inventory } = fixture();
    inventory.unpackGift(asPlayerId("nobody"), "camping_gear_box");
    expect(container.addItem).not.toHaveBeenCalled();
    expect(dimension.spawnItem).not.toHaveBeenCalled();
  });
});
