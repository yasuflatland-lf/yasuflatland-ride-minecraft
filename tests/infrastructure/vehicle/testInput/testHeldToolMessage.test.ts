import fc from "fast-check";
import { expect, it } from "vitest";
import { parseTestHeldToolMessage } from "../../../../src/infrastructure/vehicle/testInput/testHeldToolMessage";

const part = fc.string({ minLength: 1 }).filter((s) => !s.includes(","));

it("round trips vehicle ids and held tools without commas", () => {
  fc.assert(
    fc.property(
      part,
      part.filter((s) => s !== "clear"),
      (vehicleId, item) => {
        expect(parseTestHeldToolMessage(`${vehicleId},${item}`)).toEqual({
          vehicleId,
          item,
        });
      },
    ),
  );
});

it("clears the held tool", () => {
  fc.assert(
    fc.property(part, (vehicleId) => {
      expect(parseTestHeldToolMessage(`${vehicleId},clear`)).toEqual({
        vehicleId,
        item: undefined,
      });
    }),
  );
});

it("rejects wrong part counts and empty parts", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc
          .array(part, { maxLength: 6 })
          .filter((parts) => parts.length !== 2)
          .map((parts) => parts.join(",")),
        part.map((s) => `,${s}`),
        part.map((s) => `${s},`),
        fc.constant(","),
      ),
      (message) => {
        expect(parseTestHeldToolMessage(message)).toBeUndefined();
      },
    ),
  );
});
