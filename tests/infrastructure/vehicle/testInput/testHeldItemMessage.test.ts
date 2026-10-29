import fc from "fast-check";
import { expect, it } from "vitest";
import { parseTestHeldItemMessage } from "../../../../src/infrastructure/vehicle/testInput/testHeldItemMessage";

const part = fc.string({ minLength: 1 }).filter((s) => !s.includes(","));

it("round trips vehicle ids and namespaced held item IDs", () => {
  fc.assert(
    fc.property(
      part,
      fc.tuple(part, part).map(([namespace, item]) => `${namespace}:${item}`),
      (vehicleId, item) => {
        expect(parseTestHeldItemMessage(`${vehicleId},${item}`)).toEqual({
          vehicleId,
          item,
        });
      },
    ),
  );
});

it("clears the held item", () => {
  fc.assert(
    fc.property(part, (vehicleId) => {
      expect(parseTestHeldItemMessage(`${vehicleId},clear`)).toEqual({
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
        expect(parseTestHeldItemMessage(message)).toBeUndefined();
      },
    ),
  );
});
