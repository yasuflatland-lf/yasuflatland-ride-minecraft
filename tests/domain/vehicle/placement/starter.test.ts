import { describe, expect, it } from "vitest";
import { isVehicleKind } from "../../../../src/domain/vehicle/kind";
import { STARTER_KINDS } from "../../../../src/domain/vehicle/placement/starter";

describe("STARTER_KINDS (ADR 0023)", () => {
  it("starts with the SUV, the land vehicle every new player starts with", () => {
    expect(STARTER_KINDS[0]).toBe("suv");
  });

  it("lists only vehicle kinds, each once", () => {
    for (const kind of STARTER_KINDS) expect(isVehicleKind(kind)).toBe(true);
    expect(new Set(STARTER_KINDS).size).toBe(STARTER_KINDS.length);
  });
});
