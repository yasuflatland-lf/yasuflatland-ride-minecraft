import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTestToolMessage } from "../../../../src/infrastructure/vehicle/testInput/testToolMessage";

const part = fc.string({ minLength: 1 }).filter((s) => !s.includes(","));

describe("parseTestToolMessage (ADR 0138)", () => {
  it("formatting a tool command as a message and parsing it returns the original values", () => {
    fc.assert(
      fc.property(part, part, part, (id, item, state) => {
        expect(parseTestToolMessage(`${id},${item},${state}`)).toEqual({
          vehicleId: id,
          item,
          state,
        });
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
    "car,,up",
    "car,blade_switch,",
    "car,blade_switch,up,extra",
  ])("ignores a malformed message: %j", (message) => {
    expect(parseTestToolMessage(message)).toBeUndefined();
  });
});
