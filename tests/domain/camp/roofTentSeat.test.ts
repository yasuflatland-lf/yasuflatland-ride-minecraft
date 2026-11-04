import fc from "fast-check";
import { expect, it } from "vitest";
import {
  rideSeatY,
  seatedEyeHeight,
  seatPosition,
} from "../../../src/domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
const position = fc.record({ x: coordinate, y: coordinate, z: coordinate });
it("lifts the seat above the tent origin without changing horizontal position", () => {
  fc.assert(
    fc.property(position, (origin) => {
      const before = { ...origin };
      expect(seatPosition(origin)).toEqual({
        ...origin,
        y: origin.y + (5 + 2.4) / 16,
      });
      expect(origin).toEqual(before);
    }),
  );
});

it("keeps the seated eye at its target between the bed and ridge at any positive tent height", () => {
  fc.assert(
    fc.property(fc.double({ min: 0.001, max: 1000, noNaN: true }), (offset) => {
      const eye =
        offset +
        rideSeatY() -
        ROOF_TENT_SPEC.seatRiderOffset +
        ROOF_TENT_SPEC.standingEyeHeight;
      expect(eye - offset).toBeCloseTo(seatedEyeHeight("ladder"), 10);
      expect(eye).toBeGreaterThan(offset + ROOF_TENT_SPEC.seatLift);
      expect(eye).toBeLessThan(offset + ROOF_TENT_SPEC.shellRidge);
      expect(rideSeatY()).toBeLessThan(
        ROOF_TENT_SPEC.seatLift + ROOF_TENT_SPEC.seatRiderOffset,
      );
    }),
  );
});

it("keeps the seated eye the same distance below each variant's ridge", () => {
  fc.assert(
    fc.property(
      coordinate,
      fc.constantFrom("ladder", "ground" as const),
      (height, variant) => {
        const ridge =
          variant === "ladder"
            ? ROOF_TENT_SPEC.shellRidge
            : ROOF_TENT_SPEC.groundShellRidge;
        const eye =
          height +
          rideSeatY(variant) -
          ROOF_TENT_SPEC.seatRiderOffset +
          ROOF_TENT_SPEC.standingEyeHeight;
        expect(height + ridge - eye).toBeCloseTo(
          ROOF_TENT_SPEC.eyeBelowRidge,
          3,
        );
      },
    ),
  );
  expect(rideSeatY("ladder")).toBe(0.155);
  expect(rideSeatY("ground")).toBe(-0.2825);
});

it("keeps the ride seat offsets unchanged", () => {
  expect(rideSeatY("ladder")).toBe(0.155);
  expect(rideSeatY("ground")).toBe(-0.2825);
});
