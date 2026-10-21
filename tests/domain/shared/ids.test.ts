import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../src/domain/shared/ids";

describe("asVehicleId", () => {
  it("asVehicleId returns its argument unchanged", () => {
    fc.assert(fc.property(fc.string(), (s) => asVehicleId(s) === s));
  });

  it("a plain string is not a VehicleId", () => {
    const raw: string = "v";
    // @ts-expect-error a plain string must be branded first
    const id: VehicleId = raw;
    expect(id).toBe(raw);
  });
});

it("asPlayerId and asDimensionId return their argument unchanged", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      expect(asPlayerId(s)).toBe(s);
      expect(asDimensionId(s)).toBe(s);
    }),
  );
});

it("keeps player, dimension and vehicle ids apart at compile time", () => {
  const p = asPlayerId("p");
  const d = asDimensionId("minecraft:overworld");
  const v = asVehicleId("v");
  // @ts-expect-error a plain string is not a player id
  const fromString: PlayerId = "p";
  // @ts-expect-error a dimension id is not a player id
  const fromDimension: PlayerId = d;
  // @ts-expect-error a vehicle id is not a player id
  const fromVehicle: PlayerId = v;
  // @ts-expect-error a player id is not a dimension id
  const toDimension: DimensionId = p;
  const asString: string = p;
  expect([
    fromString,
    fromDimension,
    fromVehicle,
    toDimension,
    asString,
  ]).toHaveLength(5);
});
