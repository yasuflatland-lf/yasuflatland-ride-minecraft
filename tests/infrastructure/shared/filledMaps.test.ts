import fc from "fast-check";
import { expect, it } from "vitest";
import { countFilledMaps } from "../../../src/infrastructure/shared/filledMaps";

it("sums filled map stack amounts regardless of data values or other items", () => {
  const stack = fc.record({
    amount: fc.integer({ min: 1, max: 64 }),
    data: fc.nat(),
  });

  fc.assert(
    fc.property(fc.array(fc.tuple(stack, stack)), (pairs) => {
      const slots = pairs.flatMap(([map, other]) => [
        { ...map, typeId: "minecraft:filled_map" },
        undefined,
        { ...other, typeId: "minecraft:empty_map" },
      ]);
      const total = pairs.reduce((sum, [map]) => sum + map.amount, 0);
      expect(countFilledMaps(slots)).toBe(total);
    }),
  );
});
