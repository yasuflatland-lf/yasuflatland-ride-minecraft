import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type ChairFace,
  canPlaceChair,
  chairCell,
  chairYaw,
} from "../../../src/domain/camp/chair";
import { CHAIR_SPEC } from "../../../src/domain/camp/spec";

const FACES: ChairFace[] = ["up", "down", "north", "south", "east", "west"];
const cell = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -64, max: 320 }),
  z: fc.integer({ min: -1000, max: 1000 }),
});

/** The angle between two headings, in [0, 180]. */
const angleBetween = (a: number, b: number) => {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

describe("chairCell (ADR 0121)", () => {
  it("places on the clicked block only from its top face", () => {
    fc.assert(
      fc.property(cell, fc.constantFrom(...FACES), (at, face) => {
        expect(chairCell(at, face)).toEqual(face === "up" ? at : undefined);
      }),
    );
  });
});

describe("chairYaw (ADR 0121)", () => {
  it("snaps to a step, stays in (-180, 180], and faces the player within half a step", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -720, max: 720, noNaN: true }),
        (playerYaw) => {
          const yaw = chairYaw(playerYaw);
          expect(Math.abs(yaw % CHAIR_SPEC.yawStep)).toBe(0);
          expect(yaw).toBeGreaterThan(-180);
          expect(yaw).toBeLessThanOrEqual(180);
          expect(Object.is(yaw, -0)).toBe(false);
          expect(angleBetween(yaw, playerYaw + 180)).toBeLessThanOrEqual(
            CHAIR_SPEC.yawStep / 2 + 1e-9,
          );
        },
      ),
    );
  });

  it("turns a player looking south (0) into a chair facing north (180)", () => {
    expect(chairYaw(0)).toBe(180);
    expect(chairYaw(90)).toBe(-90);
    expect(chairYaw(-100)).toBe(90);
  });
});

describe("canPlaceChair (ADR 0121)", () => {
  it("is true exactly when every block from 1 to the clearance above is air", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), {
          minLength: CHAIR_SPEC.clearance + 2,
          maxLength: CHAIR_SPEC.clearance + 2,
        }),
        (air) => {
          const asked: number[] = [];
          const ok = canPlaceChair((dy) => {
            asked.push(dy);
            return air[dy] ?? false;
          });
          expect(ok).toBe(
            air.slice(1, CHAIR_SPEC.clearance + 1).every(Boolean),
          );
          expect(
            asked.every((dy) => dy >= 1 && dy <= CHAIR_SPEC.clearance),
          ).toBe(true);
        },
      ),
    );
  });

  it("needs room for the chair and a seated player's head", () => {
    expect(CHAIR_SPEC.clearance).toBe(2);
  });
});
