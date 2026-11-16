import fc from "fast-check";
import { expect, it } from "vitest";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";
import { steerAngle } from "../../../../../src/domain/vehicle/kinds/scooter/steer";

it("scales steering within the handlebar limits", () => {
  fc.assert(
    fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (input) => {
      expect(steerAngle(input, SCOOTER_SPEC)).toBe(
        Math.max(-1, Math.min(1, input)) * SCOOTER_SPEC.maxSteer,
      );
    }),
  );
});
