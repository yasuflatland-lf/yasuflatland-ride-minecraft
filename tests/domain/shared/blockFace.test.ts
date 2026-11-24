import fc from "fast-check";
import { expect, it } from "vitest";
import {
  anchorCell,
  type BlockFace,
  isTopFace,
  parseBlockFace,
} from "../../../src/domain/shared/blockFace";
import { cellOf } from "../../../src/domain/shared/cells";

const faces: readonly BlockFace[] = [
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
];

it("anchorCell moves to the neighboring cell on the selected face", () => {
  const offsets: Record<BlockFace, readonly [number, number, number]> = {
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
      const anchor = anchorCell(cellOf(block), face);
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

it("parseBlockFace round-trips all six faces in any letter case", () => {
  fc.assert(
    fc.property(
      fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      (upper) => {
        for (const face of faces) {
          const mixed = [...face]
            .map((letter, i) => (upper[i] ? letter.toUpperCase() : letter))
            .join("");
          expect(parseBlockFace(mixed)).toBe(face);
        }
      },
    ),
  );
});

it("parseBlockFace rejects every string other than a case-insensitive face", () => {
  fc.assert(
    fc.property(
      fc
        .string()
        .filter((value) => !faces.some((face) => face === value.toLowerCase())),
      (value) => {
        expect(parseBlockFace(value)).toBeUndefined();
      },
    ),
  );
});

it("moving up and then down returns to the original cell", () => {
  const coordinate = fc.integer();
  fc.assert(
    fc.property(
      fc.record({ x: coordinate, y: coordinate, z: coordinate }),
      (block) => {
        expect(anchorCell(anchorCell(cellOf(block), "up"), "down")).toEqual(
          block,
        );
      },
    ),
  );
});

it("only the up face is the top", () => {
  for (const face of faces) expect(isTopFace(face)).toBe(face === "up");
});
