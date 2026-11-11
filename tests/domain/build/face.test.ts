import fc from "fast-check";
import { expect, it } from "vitest";
import {
  anchorCell,
  type Face,
  parseFace,
} from "../../../src/domain/build/aim/face";

const faces: readonly Face[] = ["up", "down", "north", "south", "east", "west"];

it("anchorCell moves to the neighboring cell on the selected face", () => {
  const offsets: Record<Face, readonly [number, number, number]> = {
    up: [0, 1, 0],
    down: [0, -1, 0],
    north: [0, 0, -1],
    south: [0, 0, 1],
    east: [1, 0, 0],
    west: [-1, 0, 0],
  };
  const coordinate = fc.integer();
  const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
  fc.assert(
    fc.property(cell, fc.constantFrom(...faces), (block, face) => {
      const anchor = anchorCell(block, face);
      const delta = [
        anchor.x - block.x,
        anchor.y - block.y,
        anchor.z - block.z,
      ];
      expect(delta).toEqual(offsets[face]);
      expect(delta.filter((value) => Math.abs(value) === 1)).toHaveLength(1);
      expect(delta.filter((value) => value === 0)).toHaveLength(2);
    }),
  );
});

it("parseFace round-trips all six faces in any letter case", () => {
  fc.assert(
    fc.property(
      fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      (upper) => {
        for (const face of faces) {
          const mixed = [...face]
            .map((letter, i) => (upper[i] ? letter.toUpperCase() : letter))
            .join("");
          expect(parseFace(mixed)).toBe(face);
        }
      },
    ),
  );
});

it("parseFace rejects every string other than a case-insensitive face", () => {
  fc.assert(
    fc.property(
      fc
        .string()
        .filter((value) => !faces.some((face) => face === value.toLowerCase())),
      (value) => {
        expect(parseFace(value)).toBeUndefined();
      },
    ),
  );
});
