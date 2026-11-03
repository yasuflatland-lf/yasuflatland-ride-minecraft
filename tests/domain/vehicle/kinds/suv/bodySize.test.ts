import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  SUV_BODY_SIZE,
  type SuvConstructionPx,
  suvBodySize,
} from "../../../../../src/domain/vehicle/kinds/suv/bodySize";

const PX: SuvConstructionPx = {
  roofTop: 26.1,
  seatX: 6.08,
  frontSeatBackZ: -5.75,
  rearSeatBackZ: -18,
  riderAheadOfSeatBack: 5.2,
  collisionWidth: 28.8,
  collisionHeight: 25.6,
};
const MEASURED = {
  shellFront: 2.69,
  shellHalfWidth: 1.64,
  footprint: 3.4,
  seatY: 0.73,
};

describe("suvBodySize", () => {
  it("gives today's numbers for today's inputs", () => {
    const b = SUV_BODY_SIZE;
    expect(b.collision.width).toBeCloseTo(2.61, 9);
    expect(b.collision.height).toBeCloseTo(2.32, 9);
    expect(b.roofTop).toBeCloseTo((26.1 * 1.45) / 16, 9);
    expect(b.seats.x).toBeCloseTo(0.551, 9);
    expect(b.seats.frontZ).toBeCloseTo(-0.04984375, 9);
    expect(b.seats.rearZ).toBeCloseTo(-1.16, 9);
    expect(b.seats.y).toBe(0.73);
    expect(b.shell).toEqual({ front: 2.69, halfWidth: 1.64 });
    expect(b.footprint).toBe(3.4);
  });

  it("scales every derived length linearly with scale", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        (a, k) => {
          const x = suvBodySize(PX, a, MEASURED);
          const y = suvBodySize(PX, a * k, MEASURED);
          const close = (u: number, v: number) =>
            Math.abs(u * k - v) <= 1e-9 * Math.max(1, k);
          expect(close(x.collision.width, y.collision.width)).toBe(true);
          expect(close(x.collision.height, y.collision.height)).toBe(true);
          expect(close(x.roofTop, y.roofTop)).toBe(true);
          expect(close(x.seats.x, y.seats.x)).toBe(true);
          expect(close(x.seats.frontZ, y.seats.frontZ)).toBe(true);
          expect(close(x.seats.rearZ, y.seats.rearZ)).toBe(true);
        },
      ),
    );
  });
});
