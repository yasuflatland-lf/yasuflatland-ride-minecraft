import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import { serializeDecor } from "../../../../src/domain/vehicle/dock/decor";
import {
  BedrockDecorWorld,
  savedDecor,
} from "../../../../src/infrastructure/vehicle/bedrock/bedrockDecorWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  DECOR_PROPERTY,
  PLAYER_TYPE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Creative: "Creative", Survival: "Survival" },
}));

const decorList = fc.uniqueArray(
  fc.record({
    slot: fc.string(),
    item: fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/),
  }),
  { selector: (d) => d.slot, minLength: 0 },
);

function fixture() {
  const vehicle = {
    id: "vehicle",
    isValid: true,
    getDynamicProperty: vi.fn((_key: string): unknown => undefined),
    setDynamicProperty: vi.fn(),
  };
  const player = {
    id: "p",
    typeId: PLAYER_TYPE,
    isValid: true,
    getGameMode: vi.fn(() => "Survival"),
    onScreenDisplay: { setActionBar: vi.fn() },
  };
  game.getEntity.mockImplementation((id: string) =>
    id === vehicle.id ? vehicle : id === player.id ? player : undefined,
  );
  const inventory = { consumeHeld: vi.fn(() => true), giveItems: vi.fn() };
  return {
    vehicle,
    player,
    inventory,
    world: new BedrockDecorWorld(new EntityIndex(), inventory),
  };
}

describe("BedrockDecorWorld (ADR 0093)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("saves the serialized decor and removes the property when empty", () => {
    fc.assert(
      fc.property(decorList, (decor) => {
        const { vehicle, world } = fixture();
        world.saveDecor(asVehicleId(vehicle.id), decor);
        expect(vehicle.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
          DECOR_PROPERTY,
          serializeDecor(decor),
        );
      }),
    );
    const { vehicle, world } = fixture();
    world.saveDecor(asVehicleId(vehicle.id), []);
    expect(vehicle.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
      DECOR_PROPERTY,
      undefined,
    );
  });

  it("saves nothing for a missing vehicle", () => {
    const { vehicle, world } = fixture();
    world.saveDecor(asVehicleId("missing"), [
      { slot: "table", item: "potted_plant" },
    ]);
    expect(vehicle.setDynamicProperty).not.toHaveBeenCalled();
  });

  it("reads only a saved string", () => {
    fc.assert(
      fc.property(fc.anything(), (stored) => {
        const { vehicle } = fixture();
        vehicle.getDynamicProperty.mockImplementation((key: string) =>
          key === DECOR_PROPERTY ? stored : undefined,
        );
        expect(savedDecor(vehicle as never)).toBe(
          typeof stored === "string" ? stored : undefined,
        );
      }),
    );
  });

  it("takes one camping gear item from the hotbar slot", () => {
    const { inventory, world } = fixture();
    inventory.consumeHeld.mockReturnValue(false);
    expect(world.consumeDecorItem(asPlayerId("p"), 4, "percolator")).toBe(
      false,
    );
    expect(inventory.consumeHeld).toHaveBeenCalledExactlyOnceWith(
      "p",
      "yasu_ride:percolator",
      4,
    );
  });

  it("gives decor back as camping gear items", () => {
    const { inventory, world } = fixture();
    world.giveDecorItems(asPlayerId("p"), ["percolator", "mug_pair"]);
    expect(inventory.giveItems).toHaveBeenCalledExactlyOnceWith("p", [
      "yasu_ride:percolator",
      "yasu_ride:mug_pair",
    ]);
  });

  it("shows decor messages on the action bar of a present player", () => {
    const { player, world } = fixture();
    world.showMessage(asPlayerId("p"), "decor_no_slot");
    expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith(
      { translate: "yasu_ride.message.decor_no_slot" },
    );
    expect(() =>
      world.showMessage(asPlayerId("missing"), "decor_no_slot"),
    ).not.toThrow();
    expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledTimes(1);
  });

  it("reports Creative only for a valid player in Creative", () => {
    const { player, world } = fixture();
    player.getGameMode.mockReturnValue("Creative");
    expect(world.isCreative(asPlayerId("p"))).toBe(true);
    player.getGameMode.mockReturnValue("Survival");
    expect(world.isCreative(asPlayerId("p"))).toBe(false);
    player.getGameMode.mockClear();
    player.isValid = false;
    expect(world.isCreative(asPlayerId("p"))).toBe(false);
    expect(player.getGameMode).not.toHaveBeenCalled();
    expect(world.isCreative(asPlayerId("missing"))).toBe(false);
  });
});
