import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  footprintCellsAt,
  footprintClearCells,
  footprintOffsets,
  footprintOrigin,
  footprintSupportCells,
} from "../../../src/domain/shared/gearFootprint";

const coordinate = fc.integer({ min: -1000, max: 1000 });
const cellArb = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const offsetsArb = fc.uniqueArray(
  fc.record({
    ahead: fc.integer({ min: -4, max: 4 }),
    left: fc.integer({ min: -4, max: 4 }),
  }),
  {
    minLength: 1,
    maxLength: 8,
    selector: ({ ahead, left }) => `${ahead},${left}`,
  },
);
const facingArb = fc.constantFrom(
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
);

describe("gear footprints", () => {
  it("rotates ordered offsets and recovers the floor cells from their centroid", () => {
    fc.assert(
      fc.property(cellArb, offsetsArb, facingArb, (pressed, local, facing) => {
        const offsets = footprintOffsets(local, facing);
        const floor = local.map(({ ahead, left }) => ({
          x: pressed.x + ahead * facing.x + left * facing.z,
          y: pressed.y + 1,
          z: pressed.z + ahead * facing.z - left * facing.x,
        }));
        const origin = footprintOrigin(pressed, offsets);
        expect(footprintCellsAt(origin, offsets)).toEqual(floor);
        expect(footprintSupportCells(floor)).toEqual(
          floor.map((cell) => ({ ...cell, y: pressed.y })),
        );
        expect(origin.x).toBeCloseTo(
          floor.reduce((sum, cell) => sum + cell.x + 0.5, 0) / floor.length,
          10,
        );
        expect(origin.y).toBe(pressed.y + 1);
        expect(origin.z).toBeCloseTo(
          floor.reduce((sum, cell) => sum + cell.z + 0.5, 0) / floor.length,
          10,
        );
      }),
    );
  });

  it("expands floor cells in layer or column order", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(cellArb, {
          minLength: 1,
          maxLength: 8,
          selector: ({ x, z }) => `${x},${z}`,
        }),
        fc.nat(4),
        (floor, clearance) => {
          const byLayer = footprintClearCells(floor, clearance);
          const byColumn = footprintClearCells(floor, clearance, "column");
          expect(byLayer).toHaveLength(floor.length * clearance);
          expect(byColumn).toHaveLength(byLayer.length);
          for (const [index, cell] of floor.entries()) {
            for (let up = 0; up < clearance; up++) {
              const expected = { ...cell, y: cell.y + up };
              expect(byLayer[up * floor.length + index]).toEqual(expected);
              expect(byColumn[index * clearance + up]).toEqual(expected);
            }
          }
        },
      ),
    );
  });
});
