import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTestBladeMessage } from "../../../../src/infrastructure/vehicle/testInput/testBladeMessage";

const part = fc.string({ minLength: 1 }).filter((s) => !s.includes(","));

describe("parseTestBladeMessage (ADR 0138)", () => {
  it("formatting a blade command as a message and parsing it returns the original values", () => {
    fc.assert(
      fc.property(part, fc.boolean(), (id, raised) => {
        expect(
          parseTestBladeMessage(`${id},${raised ? "raised" : "lowered"}`),
        ).toEqual({ vehicleId: id, raised });
      }),
    );
  });

  it.each([
    "",
    "car",
    "car,",
    ",raised",
    "car,up",
    "car,Raised",
    "car,raised,x",
  ])("ignores a malformed message: %j", (message) => {
    expect(parseTestBladeMessage(message)).toBeUndefined();
  });
});
