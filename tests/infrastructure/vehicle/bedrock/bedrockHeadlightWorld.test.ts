import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BedrockHeadlightWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockHeadlightWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { HEADLIGHTS_PROPERTY } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const dimension = { playSound: vi.fn() };
  const vehicle = {
    id: "vehicle",
    isValid: true,
    location: { x: 1, y: 64, z: -2 },
    dimension,
    getProperty: vi.fn((_key: string): unknown => undefined),
    setProperty: vi.fn(),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === vehicle.id ? vehicle : undefined,
  );
  return {
    dimension,
    vehicle,
    headlights: new BedrockHeadlightWorld(new EntityIndex()),
  };
}

describe("BedrockHeadlightWorld", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the headlight property only when it is true", () => {
    fc.assert(
      fc.property(fc.anything(), (stored) => {
        const { vehicle, headlights } = fixture();
        vehicle.getProperty.mockImplementation((key: string) =>
          key === HEADLIGHTS_PROPERTY ? stored : undefined,
        );
        expect(headlights.headlightsOn(vehicle.id)).toBe(stored === true);
      }),
    );
  });

  it("has no headlight state for a missing or invalid vehicle", () => {
    const { vehicle, headlights } = fixture();
    expect(headlights.headlightsOn("missing")).toBeUndefined();
    vehicle.isValid = false;
    expect(headlights.headlightsOn(vehicle.id)).toBeUndefined();
  });

  it.each([true, false])("switches the headlights to %s with a click", (on) => {
    const { dimension, vehicle, headlights } = fixture();
    headlights.setHeadlights(vehicle.id, on);
    expect(vehicle.setProperty).toHaveBeenCalledExactlyOnceWith(
      HEADLIGHTS_PROPERTY,
      on,
    );
    expect(dimension.playSound).toHaveBeenCalledExactlyOnceWith(
      "random.click",
      vehicle.location,
    );
  });

  it("does nothing to a missing vehicle", () => {
    const { dimension, vehicle, headlights } = fixture();
    headlights.setHeadlights("missing", true);
    expect(vehicle.setProperty).not.toHaveBeenCalled();
    expect(dimension.playSound).not.toHaveBeenCalled();
  });
});
