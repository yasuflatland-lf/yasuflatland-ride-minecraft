import fc from "fast-check";
import { expect, it } from "vitest";
import { boxFromSize, sizeOf } from "../../../src/domain/build/box";
import {
  anchorCornerOf,
  boxAtCorner,
  cornerCell,
  turnCorner,
} from "../../../src/domain/build/clipboard/anchorCorner";
import { FACINGS } from "../../../src/domain/build/rotation/facing";
import { rotatedSize } from "../../../src/domain/build/rotation/quarterTurn";
import { cellOf } from "../../../src/domain/shared/cells";

const side = fc.constantFrom("min" as const, "max" as const);
const corner = fc.record({ x: side, z: side });
const extent = fc.integer({ min: 1, max: 64 });
const size = fc.record({ x: extent, y: extent, z: extent });
const cell = fc
  .record({ x: fc.integer(), y: fc.integer(), z: fc.integer() })
  .map(cellOf);

it("recovers the bottom anchor and the requested dimensions at every corner", () => {
  fc.assert(
    fc.property(cell, size, corner, (a, s, c) => {
      const box = boxAtCorner(a, s, c);
      expect(cornerCell(box, c)).toEqual(a);
      expect(sizeOf(box)).toEqual(s);
    }),
  );
});

it("uses the first point on each nondegenerate axis and the near-left fallback without taps", () => {
  const nearLeft = {
    north: ["min", "max"],
    east: ["min", "min"],
    south: ["max", "min"],
    west: ["max", "max"],
  };
  fc.assert(
    fc.property(
      cell,
      size,
      corner,
      fc.constantFrom(...FACINGS),
      (a, s, c, facing) => {
        const box = boxFromSize(a, s);
        const point = cellOf({ x: box[c.x].x, y: box.max.y, z: box[c.z].z });
        expect(anchorCornerOf(box, point, facing)).toEqual({
          x: s.x === 1 ? "min" : c.x,
          z: s.z === 1 ? "min" : c.z,
        });
        expect(anchorCornerOf(box, undefined, facing)).toEqual({
          x: s.x === 1 ? "min" : nearLeft[facing][0],
          z: s.z === 1 ? "min" : nearLeft[facing][1],
        });
      },
    ),
  );
});

it("places the physical source corner at every engine rotation and returns it after four turns", () => {
  fc.assert(
    fc.property(cell, size, corner, (min, s, c) => {
      let x = c.x === "min" ? 0 : s.x - 1;
      let z = c.z === "min" ? 0 : s.z - 1;
      let step = c;
      for (const turn of [0, 1, 2, 3] as const) {
        const dimensions = rotatedSize(s, turn);
        expect(turnCorner(c, turn)).toEqual(step);
        expect(cornerCell(boxFromSize(min, dimensions), step)).toEqual(
          cellOf({ x: min.x + x, y: min.y, z: min.z + z }),
        );
        [x, z] = [dimensions.z - 1 - z, x];
        step = turnCorner(step, 1);
      }
      expect(step).toEqual(c);
    }),
  );
});
