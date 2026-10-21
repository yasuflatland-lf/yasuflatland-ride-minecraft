import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseTestDecorMessage } from "../../../../src/infrastructure/vehicle/testInput/testDecorMessage";

const part = fc.string({ minLength: 1 }).filter((s) => !s.includes(","));
const item = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,15}$/)
  .filter((s) => s !== "clear");

describe("parseTestDecorMessage (ADR 0093)", () => {
  it("formatting a decor command as a message and parsing it returns the original values", () => {
    fc.assert(
      fc.property(part, part, item, (id, slot, gear) => {
        expect(parseTestDecorMessage(`${id},${slot},${gear}`)).toEqual({
          vehicleId: id,
          slot,
          item: gear,
        });
      }),
    );
  });

  it("clear empties the slot", () => {
    expect(parseTestDecorMessage("car,table,clear")).toEqual({
      vehicleId: "car",
      slot: "table",
      item: undefined,
    });
  });

  it.each([
    "",
    "car",
    "car,table",
    "car,table,a,b",
    ",table,a",
    "car,,a",
    "car,table,",
  ])("ignores a malformed message: %j", (message) => {
    expect(parseTestDecorMessage(message)).toBeUndefined();
  });
});
