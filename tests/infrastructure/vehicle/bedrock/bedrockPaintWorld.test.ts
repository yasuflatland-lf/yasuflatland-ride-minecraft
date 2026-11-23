import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import { PAINTS } from "../../../../src/domain/shared/paint";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { dyeOf, paintEvent } from "../../../../src/infrastructure/shared/dyes";
import type { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPaintWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPaintWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import { ENTITY_TYPE } from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { PAINT_VARIANT } from "../../../../src/test-pack/scenarios/support/paintContract";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  GameMode: { Creative: "Creative" },
}));

function fixture() {
  const dimension = { playSound: vi.fn() };
  const vehicle = {
    id: "vehicle",
    typeId: "yasu_ride:suv",
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

  it.each(VEHICLE_KINDS)("reports the kind of a %s entity", (kind) => {
    const { vehicle, paint } = fixture();
    vehicle.typeId = ENTITY_TYPE[kind];
    expect(paint.kindOf(asVehicleId(vehicle.id))).toBe(kind);
  });

  it("an unknown type has no kind", () => {
    const { vehicle, paint } = fixture();
    vehicle.typeId = "yasu_ride:unknown";
    expect(paint.kindOf(asVehicleId(vehicle.id))).toBeUndefined();
  });

  it("a missing or invalid vehicle has no kind", () => {
    const { vehicle, paint } = fixture();
    expect(paint.kindOf(asVehicleId("missing"))).toBeUndefined();
    vehicle.isValid = false;
    expect(paint.kindOf(asVehicleId(vehicle.id))).toBeUndefined();
  });

  it("is true for a valid player in creative", () => {
    const { paint } = fixture();
    game.getEntity.mockReturnValue({
      typeId: "minecraft:player",
      isValid: true,
      getGameMode: () => "Creative",
    });
    expect(paint.isCreative(asPlayerId("p"))).toBe(true);
  });

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

  it("has no paint for a missing vehicle", () => {
    const { paint } = fixture();
    expect(paint.paintOf(asVehicleId("missing"))).toBeUndefined();
  });

  it.each(PAINTS)("paints the vehicle %s without the dye sound", (color) => {
    const { dimension, vehicle, paint } = fixture();
    paint.paint(asVehicleId(vehicle.id), color);
    expect(vehicle.triggerEvent).toHaveBeenCalledExactlyOnceWith(
      paintEvent(color),
    );
    expect(dimension.playSound).not.toHaveBeenCalled();
  });

  it("normalizes fixed paint without a removed paint event", () => {
    const { vehicle, paint } = fixture();
    vehicle.typeId = "yasu_ride:camper";
    paint.paint(asVehicleId(vehicle.id), PAINTS[0]);
    expect(vehicle.triggerEvent).toHaveBeenCalledExactlyOnceWith(
      "yasu_ride:normalize_paint",
    );
  });

  it("plays the dye sound at the vehicle", () => {
    const { dimension, vehicle, paint } = fixture();
    paint.playPaintSound(asVehicleId(vehicle.id));
    expect(dimension.playSound).toHaveBeenCalledExactlyOnceWith(
      "dye.use",
      vehicle.location,
    );
  });

  it("logs and swallows a failing dye sound", () => {
    const { dimension, vehicle, paint } = fixture();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dimension.playSound.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => paint.playPaintSound(asVehicleId(vehicle.id))).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it.each(["paint", "playPaintSound"] as const)(
    "%s leaves a missing vehicle alone",
    (write) => {
      const { dimension, vehicle, paint } = fixture();
      const missing = asVehicleId("missing");
      if (write === "paint") paint.paint(missing, "red");
      else paint.playPaintSound(missing);
      expect(vehicle.triggerEvent).not.toHaveBeenCalled();
      expect(dimension.playSound).not.toHaveBeenCalled();
    },
  );

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
