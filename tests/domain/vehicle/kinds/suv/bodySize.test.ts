import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
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
  it("keeps measured probes and seat height independent of scale", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 5, noNaN: true }), (scale) => {
        const body = suvBodySize(PX, scale, MEASURED);
        expect(body.shell).toEqual({
          front: MEASURED.shellFront,
          halfWidth: MEASURED.shellHalfWidth,
        });
        expect(body.footprint).toBe(MEASURED.footprint);
        expect(body.seats.y).toBe(MEASURED.seatY);
      }),
    );
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
