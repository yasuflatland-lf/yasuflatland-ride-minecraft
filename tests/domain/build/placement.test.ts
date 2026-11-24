import fc from "fast-check";
import { expect, it } from "vitest";
import { boxFromSize, contains, sizeOf } from "../../../src/domain/build/box";
import { placedPasteBox } from "../../../src/domain/build/clipboard/placement";
import {
  FACINGS,
  facingVector,
} from "../../../src/domain/build/rotation/facing";
import {
  anchorCell,
  type BlockFace,
} from "../../../src/domain/shared/blockFace";
import { cellOf } from "../../../src/domain/shared/cells";

const anchor = fc.record({
  x: fc.integer({ min: -100000, max: 100000 }),
  y: fc.integer({ min: -1000, max: 1000 }),
  z: fc.integer({ min: -100000, max: 100000 }),
});
const side = fc.integer({ min: 1, max: 64 });
const size = fc.record({ x: side, y: side, z: side });
const facing = fc.constantFrom(...FACINGS);
const face = fc.constantFrom<BlockFace>("up", "down", ...FACINGS);

it("contains the anchor and preserves the already-rotated dimensions", () => {
  fc.assert(
    fc.property(anchor, size, facing, face, (a, s, f, hit) => {
      const box = placedPasteBox(cellOf(a), s, f, hit);
      expect(contains(box, cellOf(a))).toBe(true);
      expect(sizeOf(box)).toEqual(s);
      expect(box.min.y).toBe(a.y);
      expect(box.max.y).toBe(a.y + s.y - 1);
    }),
  );
});

it("grows forward and right from the near-left anchor on vertical faces", () => {
  fc.assert(
    fc.property(
      anchor,
      size,
      facing,
      fc.constantFrom<BlockFace>("up", "down"),
      (a, s, f, hit) => {
        const box = placedPasteBox(cellOf(a), s, f, hit);
        const forward = facingVector(f);
        const right = { x: -forward.z, z: forward.x };
        expect(
          contains(
            box,
            cellOf({ x: a.x - forward.x, y: a.y, z: a.z - forward.z }),
          ),
        ).toBe(false);
        for (const x of [box.min.x, box.max.x]) {
          for (const z of [box.min.z, box.max.z]) {
            expect(
              (x - a.x) * forward.x + (z - a.z) * forward.z,
            ).toBeGreaterThanOrEqual(0);
            expect(
              (x - a.x) * right.x + (z - a.z) * right.z,
            ).toBeGreaterThanOrEqual(0);
          }
        }
      },
    ),
  );
});

it("grows away from walls and right when looking into them regardless of facing", () => {
  fc.assert(
    fc.property(anchor, size, facing, facing, facing, (a, s, hit, f, other) => {
      const box = placedPasteBox(cellOf(a), s, f, hit);
      const normal = facingVector(hit);
      const right = { x: normal.z, z: -normal.x };
      expect(
        contains(box, cellOf({ x: a.x - normal.x, y: a.y, z: a.z - normal.z })),
      ).toBe(false);
      expect(box).toEqual(placedPasteBox(cellOf(a), s, other, hit));
      for (const x of [box.min.x, box.max.x]) {
        for (const z of [box.min.z, box.max.z]) {
          expect(
            (x - a.x) * normal.x + (z - a.z) * normal.z,
          ).toBeGreaterThanOrEqual(0);
          expect(
            (x - a.x) * right.x + (z - a.z) * right.z,
          ).toBeGreaterThanOrEqual(0);
        }
      }
      const aimedBlock = cellOf({
        x: a.x - normal.x,
        y: a.y,
        z: a.z - normal.z,
      });
      expect(anchorCell(aimedBlock, hit)).toEqual(a);
    }),
  );
});

it("matches the existing positive-axis box when facing east on top", () => {
  fc.assert(
    fc.property(anchor, size, (a, s) => {
      expect(placedPasteBox(cellOf(a), s, "east", "up")).toEqual(
        boxFromSize(cellOf(a), s),
      );
    }),
  );
});
