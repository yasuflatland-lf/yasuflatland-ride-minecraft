import fc from "fast-check";
import { expect, it } from "vitest";
import {
  effectiveTurn,
  FACINGS,
  facingFromDirection,
  facingFromYaw,
  facingVector,
  parseFacing,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import {
  NO_TURN,
  nextQuarterTurn,
  type QuarterTurn,
} from "../../../src/domain/build/rotation/quarterTurn";
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

it("keeps the facing-derived turn when there is no manual offset", () => {
  fc.assert(
    fc.property(facing, facing, (copied, gaze) => {
      expect(effectiveTurn(copied, gaze, NO_TURN)).toBe(
        turnBetween(copied, gaze),
      );
    }),
  );
});

it("four successive manual quarter turns return to the starting turn", () => {
  fc.assert(
    fc.property(
      facing,
      facing,
      fc.constantFrom<QuarterTurn>(0, 1, 2, 3),
      (copied, gaze, manual) => {
        const start = effectiveTurn(copied, gaze, manual);
        let offset = manual;
        let previous = start;
        for (let step = 0; step < 4; step++) {
          offset = nextQuarterTurn(offset);
          const current = effectiveTurn(copied, gaze, offset);
          expect(current).toBe((previous + 1) % 4);
          previous = current;
        }
        expect(previous).toBe(start);
      },
    ),
  );
});

it("normalizes every effective turn to a clockwise quarter turn", () => {
  fc.assert(
    fc.property(
      facing,
      facing,
      fc.constantFrom<QuarterTurn>(0, 1, 2, 3),
      (copied, gaze, manual) => {
        expect([0, 1, 2, 3]).toContain(effectiveTurn(copied, gaze, manual));
      },
    ),
  );
});
