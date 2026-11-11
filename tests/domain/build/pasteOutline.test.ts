import fc from "fast-check";
import { expect, it } from "vitest";
import type { CellBox } from "../../../src/domain/build/box";
import { pasteOutline } from "../../../src/domain/build/preview/pasteOutline";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import type { Vec3 } from "../../../src/domain/shared/vec";

const coordinate = fc.integer({ min: -10000, max: 10000 });
const origin = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const boxes = (maxSide: number, minHeight = 1) =>
  fc
    .tuple(
      origin,
      fc.integer({ min: 1, max: maxSide }),
      fc.integer({ min: minHeight, max: maxSide }),
      fc.integer({ min: 1, max: maxSide }),
    )
    .map(
      ([min, width, height, depth]): CellBox => ({
        min,
        max: {
          x: min.x + width - 1,
          y: min.y + height - 1,
          z: min.z + depth - 1,
        },
      }),
    );

function bottomComplete(box: CellBox, points: Vec3[]) {
  for (let x = box.min.x; x <= box.max.x; x++)
    for (const z of [box.min.z, box.max.z])
      expect(points).toContainEqual({
        x: x + 0.5,
        y: box.min.y + 0.5,
        z: z + 0.5,
      });
  for (let z = box.min.z; z <= box.max.z; z++)
    for (const x of [box.min.x, box.max.x])
      expect(points).toContainEqual({
        x: x + 0.5,
        y: box.min.y + 0.5,
        z: z + 0.5,
      });
}

it("bounds the combined budget and separates horizontal and vertical box edges", () => {
  fc.assert(
    fc.property(
      boxes(300),
      fc.integer({ min: 0, max: 1024 }),
      (box, budget) => {
        const { horizontal, vertical } = pasteOutline(box, budget);
        expect(horizontal.length + vertical.length).toBeLessThanOrEqual(budget);
        for (const p of [...horizontal, ...vertical]) {
          const axes = ["x", "y", "z"] as const;
          expect(
            axes.every(
              (a) => p[a] >= box.min[a] + 0.5 && p[a] <= box.max[a] + 0.5,
            ),
          ).toBe(true);
          expect(
            axes.filter(
              (a) => p[a] === box.min[a] + 0.5 || p[a] === box.max[a] + 0.5,
            ).length,
          ).toBeGreaterThanOrEqual(2);
        }
        for (const p of horizontal)
          expect([box.min.y + 0.5, box.max.y + 0.5]).toContain(p.y);
        for (const p of vertical) {
          expect([box.min.x + 0.5, box.max.x + 0.5]).toContain(p.x);
          expect([box.min.z + 0.5, box.max.z + 0.5]).toContain(p.z);
        }
      },
    ),
  );
});

it("completes the bottom ring and makes the lowest vertical block denser", () => {
  fc.assert(
    fc.property(boxes(8, 3), (box) => {
      const { horizontal, vertical } = pasteOutline(
        box,
        BUILD_SPEC.outlineMaxPoints,
      );
      bottomComplete(box, horizontal);
      const low = vertical.filter((p) => p.y <= box.min.y + 1.5).length;
      const upper = vertical.length - low;
      expect(upper).toBeGreaterThan(0);
      expect(low).toBeGreaterThan(upper / (box.max.y - box.min.y - 1));
      expect(vertical.filter((p) => p.y === box.min.y + 1.5)).toHaveLength(4);
    }),
  );
});

it("spends the budget on ground contact before the top ring and upper vertical edges", () => {
  fc.assert(
    fc.property(boxes(8, 3), (box) => {
      const bottomWant =
        2 * ((box.max.x - box.min.x) * BUILD_SPEC.denseOutlinePerBlock + 1) +
        2 * ((box.max.z - box.min.z) * BUILD_SPEC.denseOutlinePerBlock + 1);
      const tierA = bottomWant + 4 * (BUILD_SPEC.denseOutlinePerBlock + 1);
      const tierB =
        2 * (box.max.x - box.min.x + 1) + 2 * (box.max.z - box.min.z + 1);
      const fullGround = pasteOutline(box, tierA + tierB);
      bottomComplete(box, fullGround.horizontal);
      expect(fullGround.horizontal.some((p) => p.y === box.max.y + 0.5)).toBe(
        true,
      );
      expect(fullGround.vertical.every((p) => p.y <= box.min.y + 1.5)).toBe(
        true,
      );
      const tight = pasteOutline(box, tierA - 1);
      expect(tight.horizontal.every((p) => p.y === box.min.y + 0.5)).toBe(true);
      expect(tight.vertical.every((p) => p.y <= box.min.y + 1.5)).toBe(true);
      expect(tight.horizontal.length + tight.vertical.length).toBe(tierA - 1);
    }),
  );
});

it("has no vertical edges for a single block of height", () => {
  fc.assert(
    fc.property(boxes(8), (box) => {
      const flat = { ...box, max: { ...box.max, y: box.min.y } };
      expect(pasteOutline(flat, BUILD_SPEC.outlineMaxPoints).vertical).toEqual(
        [],
      );
    }),
  );
});

it("floors fractional budgets and clamps negative budgets to zero", () => {
  fc.assert(
    fc.property(boxes(8), fc.integer({ min: -10, max: 100 }), (box, budget) => {
      const { horizontal, vertical } = pasteOutline(box, budget + 0.75);
      expect(horizontal.length + vertical.length).toBeLessThanOrEqual(
        Math.max(0, budget),
      );
    }),
  );
});
