import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import { serializeDecor } from "../../../../src/domain/vehicle/dock/decor";
import {
  BedrockDecorWorld,
  savedDecor,
} from "../../../../src/infrastructure/vehicle/bedrock/bedrockDecorWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { DECOR_PROPERTY } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

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
  game.getEntity.mockImplementation((id: string) =>
    id === vehicle.id ? vehicle : undefined,
  );
  return { vehicle, world: new BedrockDecorWorld(new EntityIndex()) };
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
});
