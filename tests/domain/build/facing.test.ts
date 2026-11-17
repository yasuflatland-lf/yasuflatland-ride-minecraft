import fc from "fast-check";
import { expect, it } from "vitest";
import {
  FACINGS,
  facingFromDirection,
  facingFromYaw,
  facingVector,
  parseFacing,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import { BUILD_SPEC } from "../../../src/domain/build/spec";

const facing = fc.constantFrom(...FACINGS);
const direction = (degrees: number) => ({
  x: Math.sin((degrees * Math.PI) / 180),
  y: 0,
  z: -Math.cos((degrees * Math.PI) / 180),
});

it("composes clockwise turns", () => {
  fc.assert(
    fc.property(facing, facing, facing, (a, b, c) => {
      expect(turnBetween(a, a)).toBe(0);
      expect((turnBetween(a, b) + turnBetween(b, a)) % 4).toBe(0);
      expect((turnBetween(a, b) + turnBetween(b, c)) % 4).toBe(
        turnBetween(a, c),
      );
    }),
  );
});

it("maps cardinal vectors and Bedrock yaw to facings", () => {
  fc.assert(
    fc.property(facing, (f) => {
      expect(facingFromDirection(facingVector(f))).toBe(f);
    }),
  );
  fc.assert(
    fc.property(
      fc
        .integer({ min: -100000, max: 100000 })
        .filter((n) => Math.abs(n % 90) !== 45),
      (yaw) => {
        const radians = (yaw * Math.PI) / 180;
        expect(facingFromYaw(yaw)).toBe(
          facingFromDirection({
            x: -Math.sin(radians),
            y: 0,
            z: Math.cos(radians),
          }),
        );
      },
    ),
  );
});

it("holds the current facing through the hysteresis margin", () => {
  fc.assert(
    fc.property(
      facing,
      facing,
      fc.integer({ min: -180000, max: 180000 }),
      (current, other, millidegrees) => {
        const offset = millidegrees / 1000;
        const centre = FACINGS.indexOf(current) * 90;
        const result = facingFromDirection(direction(centre + offset), current);
        if (
          Math.abs(offset) <
          45 + BUILD_SPEC.pasteFacingHysteresisDegrees - 0.001
        )
          expect(result).toBe(current);
        if (
          Math.abs(offset) >
          45 + BUILD_SPEC.pasteFacingHysteresisDegrees + 0.001
        )
          expect(result).toBe(facingFromDirection(direction(centre + offset)));
        if (Math.abs(offset) < 34.999)
          expect(facingFromDirection(direction(centre + offset), other)).toBe(
            current,
          );
      },
    ),
  );
});

it("rejects vertical directions and parses facing names", () => {
  fc.assert(
    fc.property(facing, (f) => {
      expect(parseFacing(f.toUpperCase())).toBe(f);
      expect(facingFromDirection({ x: 0, y: 1, z: 0 }, f)).toBeUndefined();
      expect(
        facingFromDirection({
          x: BUILD_SPEC.facingMinHorizontal / 2,
          y: 0,
          z: 0,
        }),
      ).toBeUndefined();
    }),
  );
  fc.assert(
    fc.property(
      fc
        .string()
        .filter(
          (s) => !FACINGS.includes(s.toLowerCase() as (typeof FACINGS)[number]),
        ),
      (s) => {
        expect(parseFacing(s)).toBeUndefined();
      },
    ),
  );
});
