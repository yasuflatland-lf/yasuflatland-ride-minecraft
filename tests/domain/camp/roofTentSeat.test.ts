import fc from "fast-check";
import { expect, it } from "vitest";
import {
  needsHold,
  seatPosition,
} from "../../../src/domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
const position = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const drift = fc.double({ min: -0.3, max: 0.3, noNaN: true });
const displacement = fc.record({ x: drift, y: drift, z: drift });

it("lifts the seat above the tent origin without changing horizontal position", () => {
  fc.assert(
    fc.property(position, (origin) => {
      const before = { ...origin };
      expect(seatPosition(origin)).toEqual({
        ...origin,
        y: origin.y + (5 + 2.4) / 16,
      });
      expect(origin).toEqual(before);
      expect(needsHold(seatPosition(origin), seatPosition(origin))).toBe(false);
    }),
  );
});

it("holds only beyond the seat tolerance in three dimensions", () => {
  fc.assert(
    fc.property(position, displacement, (seat, offset) => {
      const current = {
        x: seat.x + offset.x,
        y: seat.y + offset.y,
        z: seat.z + offset.z,
      };
      const distance = Math.sqrt(
        (current.x - seat.x) ** 2 +
          (current.y - seat.y) ** 2 +
          (current.z - seat.z) ** 2,
      );
      expect(needsHold(current, seat)).toBe(
        distance > ROOF_TENT_SPEC.seatTolerance,
      );
    }),
  );
});

it("allows the tolerance boundary and holds just beyond it on every axis", () => {
  const seat = { x: 0, y: 0, z: 0 };
  for (const axis of ["x", "y", "z"] as const) {
    for (const sign of [-1, 1]) {
      expect(
        needsHold(
          { ...seat, [axis]: sign * ROOF_TENT_SPEC.seatTolerance },
          seat,
        ),
      ).toBe(false);
      expect(
        needsHold(
          { ...seat, [axis]: sign * (ROOF_TENT_SPEC.seatTolerance + 0.001) },
          seat,
        ),
      ).toBe(true);
    }
  }
});
