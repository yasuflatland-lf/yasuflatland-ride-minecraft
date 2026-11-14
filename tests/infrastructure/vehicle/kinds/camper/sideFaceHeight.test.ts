import fc from "fast-check";
import { expect, it } from "vitest";
import { sideFaceHeight } from "../../../../../src/infrastructure/vehicle/kinds/camper/sideFaceHeight";

const height = fc.double({ min: 0, max: 1, noNaN: true });

it("inverts touch side-face heights", () => {
  fc.assert(
    fc.property(height, (y) => {
      expect(sideFaceHeight(y, "Touch")).toBe(1 - y);
    }),
  );
});

it("preserves heights for every other input mode", () => {
  fc.assert(
    fc.property(
      height,
      fc.option(
        fc.string().filter((mode) => mode !== "Touch"),
        { nil: undefined },
      ),
      (y, mode) => {
        expect(sideFaceHeight(y, mode)).toBe(y);
      },
    ),
  );
  expect(sideFaceHeight(4.679 / 16, "KeyboardAndMouse")).toBe(4.679 / 16);
});

it("is an involution for touch heights", () => {
  fc.assert(
    fc.property(height, (y) => {
      expect(sideFaceHeight(sideFaceHeight(y, "Touch"), "Touch")).toBeCloseTo(
        y,
        15,
      );
    }),
  );
});
