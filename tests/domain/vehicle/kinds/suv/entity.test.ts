import fc from "fast-check";
import { expect, it } from "vitest";
import {
  DOOR_BY_SEAT,
  doorCommands,
} from "../../../../../src/domain/vehicle/kinds/suv/entity";
import { FORMS } from "../../../../../src/domain/vehicle/motion/forms";

it("opens the declared seat door with sound and ignores seats without a door", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.integer(), fc.integer({ min: 0, max: 3 })),
      (seat) => {
        const door = DOOR_BY_SEAT[seat];
        expect(doorCommands(seat)).toStrictEqual(
          door === undefined
            ? []
            : [
                { type: "playAnimation", name: door },
                { type: "playSound", name: "random.door_open" },
              ],
        );
      },
    ),
  );
});

it("declares the established form values in their engine order", () => {
  expect(FORMS).toEqual(["car", "takeoff", "hover", "landing", "submarine"]);
});
