import { it } from "vitest";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
  type DimensionId,
  type PlayerId,
  type VehicleId,
} from "../../../src/domain/shared/ids";

it("a plain string is not a VehicleId", () => {
  const raw: string = "v";
  // @ts-expect-error a plain string must be branded first
  const id: VehicleId = raw;
  void id;
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
  void [fromString, fromDimension, fromVehicle, toDimension, asString];
});
