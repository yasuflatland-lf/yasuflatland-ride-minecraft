import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
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
    expect(inventory.receivedStarter(asPlayerId("nobody"))).toBeUndefined();
  });

  it("reports the starter flag only when it is exactly true", () => {
    fc.assert(
      fc.property(fc.constantFrom(true, false, undefined, "true"), (value) => {
        const { player, inventory } = fixture();
        player.getDynamicProperty.mockReturnValue(value);
        expect(inventory.receivedStarter(asPlayerId("player"))).toBe(
          value === true,
        );
        expect(player.getDynamicProperty).toHaveBeenCalledWith(
          STARTER_RECEIVED_PROPERTY,
        );
      }),
    );
  });

  it("marks the starter as received on a present player", () => {
    const { player, inventory } = fixture();
    inventory.markStarterReceived(asPlayerId("player"));
    expect(player.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
      STARTER_RECEIVED_PROPERTY,
      true,
    );
  });

  it("does nothing when marking a missing player", () => {
    const { player, inventory } = fixture();
    expect(() =>
      inventory.markStarterReceived(asPlayerId("nobody")),
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
});
