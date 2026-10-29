import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import { PAINTS } from "../../../../src/domain/shared/paint";
import {
  dyeOf,
  PAINT_VARIANT,
  paintEvent,
} from "../../../../src/infrastructure/shared/dyes";
import type { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPaintWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPaintWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";

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
        expect(paint.paintOf(asVehicleId(vehicle.id))).toBe(expected);
      }),
    );
  });

  it("reads variant 0 when the vehicle has no variant component", () => {
    const { vehicle, paint } = fixture();
    expect(paint.paintOf(asVehicleId(vehicle.id))).toBe(PAINTS[0]);
  });

  it("has no paint for a missing vehicle or an unknown variant", () => {
    const { vehicle, paint } = fixture();
    expect(paint.paintOf(asVehicleId("missing"))).toBeUndefined();
    vehicle.getComponent.mockReturnValue({ value: PAINTS.length });
    expect(paint.paintOf(asVehicleId(vehicle.id))).toBeUndefined();
  });

  it.each(PAINTS)("paints the vehicle %s with the dye sound", (color) => {
    const { dimension, vehicle, paint } = fixture();
    paint.paint(asVehicleId(vehicle.id), color);
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
    paint.paint(asVehicleId("missing"), "red");
    expect(vehicle.triggerEvent).not.toHaveBeenCalled();
    expect(dimension.playSound).not.toHaveBeenCalled();
  });

  it.each(PAINTS)("takes one %s dye from the held slot", (color) => {
    const { consumeHeld, paint } = fixture();
    paint.consumeDye(asPlayerId("player"), color);
    expect(consumeHeld).toHaveBeenCalledExactlyOnceWith("player", dyeOf(color));
  });
});

it("indexes integer variants and rejects non-integers, defaulting a missing component to khaki", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.integer({ min: -5, max: PAINTS.length + 5 }),
        fc.double().filter((value) => !Number.isInteger(value)),
      ),
      (variant) => {
        const { vehicle, paint } = fixture();
        vehicle.getComponent.mockReturnValue({ value: variant });
        const expected =
          Number.isInteger(variant) && variant >= 0 && variant < PAINTS.length
            ? PAINTS[variant]
            : undefined;
        expect(paint.paintOf(asVehicleId(vehicle.id))).toBe(expected);
        vehicle.getComponent.mockReturnValue(undefined);
        expect(paint.paintOf(asVehicleId(vehicle.id))).toBe("khaki");
      },
    ),
  );
});
