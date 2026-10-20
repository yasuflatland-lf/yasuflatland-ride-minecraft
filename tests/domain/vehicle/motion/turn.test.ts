import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeYaw } from "../../../../src/domain/shared/vec";
import { turnFraction } from "../../../../src/domain/vehicle/motion/turn";

describe("turnFraction", () => {
  it("gives the normalized yaw change over the turn rate", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -179, max: 179, noNaN: true }),
        fc.double({ min: 0.5, max: 12, noNaN: true }),
        (y, d, rate) => {
          expect(turnFraction(y, normalizeYaw(y + d), rate)).toBeCloseTo(
            d / rate,
            9,
          );
        },
      ),
    );
  });

  it("measures across the ±180° wrap", () => {
    expect(turnFraction(178, -178, 4)).toBeCloseTo(1);
    expect(turnFraction(-178, 178, 4)).toBeCloseTo(-1);
  });

  it("is undefined when not finite", () => {
    expect(turnFraction(0, 0, 0)).toBeUndefined();
    expect(turnFraction(0, 10, 0)).toBeUndefined();
    expect(turnFraction(Number.NaN, 0, 6)).toBeUndefined();
  });
});
