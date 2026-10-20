import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAINTS } from "../../../../src/domain/vehicle/paint/paint";
import type { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPaintWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPaintWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  dyeOf,
  PAINT_VARIANT,
  paintEvent,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const dimension = { playSound: vi.fn() };
  const vehicle = {
    id: "vehicle",
    isValid: true,
    location: { x: 1, y: 64, z: -2 },
    dimension,
    getComponent: vi.fn((_name: string): unknown => undefined),
    triggerEvent: vi.fn(),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === vehicle.id ? vehicle : undefined,
  );
  const consumeHeld = vi.fn();
  const inventory = { consumeHeld } as unknown as BedrockInventory;
  return {
    dimension,
    vehicle,
    consumeHeld,
    paint: new BedrockPaintWorld(new EntityIndex(), inventory),
  };
}

describe("BedrockPaintWorld", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the paint from the variant component", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (expected) => {
        const { vehicle, paint } = fixture();
        vehicle.getComponent.mockImplementation((name: string) =>
          name === "minecraft:variant"
            ? { value: PAINT_VARIANT[expected] }
            : undefined,
        );
        expect(paint.paintOf(vehicle.id)).toBe(expected);
      }),
    );
  });

  it("reads variant 0 when the vehicle has no variant component", () => {
    const { vehicle, paint } = fixture();
    expect(paint.paintOf(vehicle.id)).toBe(PAINTS[0]);
  });

  it("has no paint for a missing vehicle or an unknown variant", () => {
    const { vehicle, paint } = fixture();
    expect(paint.paintOf("missing")).toBeUndefined();
    vehicle.getComponent.mockReturnValue({ value: PAINTS.length });
    expect(paint.paintOf(vehicle.id)).toBeUndefined();
  });

  it.each(PAINTS)("paints the vehicle %s with the dye sound", (color) => {
    const { dimension, vehicle, paint } = fixture();
    paint.paint(vehicle.id, color);
    expect(vehicle.triggerEvent).toHaveBeenCalledExactlyOnceWith(
      paintEvent(color),
    );
    expect(dimension.playSound).toHaveBeenCalledExactlyOnceWith(
      "dye.use",
      vehicle.location,
    );
  });

  it("does not paint a missing vehicle", () => {
    const { dimension, vehicle, paint } = fixture();
    paint.paint("missing", "red");
    expect(vehicle.triggerEvent).not.toHaveBeenCalled();
    expect(dimension.playSound).not.toHaveBeenCalled();
  });

  it.each(PAINTS)("takes one %s dye from the held slot", (color) => {
    const { consumeHeld, paint } = fixture();
    paint.consumeDye("player", color);
    expect(consumeHeld).toHaveBeenCalledExactlyOnceWith("player", dyeOf(color));
  });
});
