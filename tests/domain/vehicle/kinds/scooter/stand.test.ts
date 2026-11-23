import fc from "fast-check";
import { expect, it } from "vitest";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";
import { standDown } from "../../../../../src/domain/vehicle/kinds/scooter/stand";

it("lowers only when empty, stopped and dry", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.double({ min: -2, max: 2, noNaN: true }),
      (occupied, water, speed) => {
        expect(standDown(occupied, speed, water)).toBe(
          !occupied && !water && Math.abs(speed) < SCOOTER_SPEC.standSpeed,
        );
      },
    ),
    { examples: [[false, false, 0]] },
  );
});
it.each([-1, 1])(
  "stays up at the stopped threshold in direction %i",
  (sign) => {
    expect(standDown(false, sign * SCOOTER_SPEC.standSpeed, false)).toBe(false);
  },
);
