import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asVehicleId, type VehicleId } from "../../../src/domain/shared/ids";

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
