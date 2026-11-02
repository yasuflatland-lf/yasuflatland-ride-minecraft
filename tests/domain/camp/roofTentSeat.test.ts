import fc from "fast-check";
import { expect, it } from "vitest";
import { seatPosition } from "../../../src/domain/camp/roofTent/seat";

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
