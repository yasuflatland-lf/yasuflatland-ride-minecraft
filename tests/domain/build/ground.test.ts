import fc from "fast-check";
import { expect, it } from "vitest";
import {
  boxFromSize,
  type CellBox,
  sizeOf,
} from "../../../src/domain/build/box";
import {
  groundScanDepth,
  snapToGround,
} from "../../../src/domain/build/clipboard/ground";
import { BUILD_SPEC } from "../../../src/domain/build/spec";

const coordinate = fc.integer({ min: -100, max: 100 });
const side = fc.integer({ min: 1, max: 8 });
const box = fc
  .tuple(
    fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    fc.record({ x: side, y: side, z: side }),
  )
  .map(([min, size]) => boxFromSize(min, size));

// A world column: its top ground cell, read only within [lowestY, fromY].
function probeOf(
  box: CellBox,
  tops: (number | undefined)[],
  fromY: number,
  reads: { lowestY: number }[] = [],
) {
  return (x: number, z: number, lowestY: number) => {
    reads.push({ lowestY });
    const top = tops[(z - box.min.z) * 8 + x - box.min.x];
    return top !== undefined && top >= lowestY && top <= fromY
      ? top
      : undefined;
  };
}

it("sits on the highest ground within the scan depth, preserves the footprint and size, and is idempotent", () => {
  fc.assert(
    fc.property(
      box,
      fc.array(
        fc.option(fc.integer({ min: -100, max: 0 }), { nil: undefined }),
        { minLength: 64, maxLength: 64 },
      ),
      (box, offsets) => {
        const tops = offsets.map((offset) =>
          offset === undefined ? undefined : box.min.y + offset,
        );
        const result = snapToGround(box, probeOf(box, tops, box.min.y));
        const deepest = box.min.y - BUILD_SPEC.groundSearchDepth + 1;
        const ground = [];
        for (let z = box.min.z; z <= box.max.z; z++)
          for (let x = box.min.x; x <= box.max.x; x++) {
            const top = tops[(z - box.min.z) * 8 + x - box.min.x];
            if (top !== undefined && top >= deepest) ground.push(top);
          }
        if (!ground.length) {
          expect(result).toBeUndefined();
          return;
        }
        if (!result) throw new Error("Expected ground");
        expect(result.min.y).toBe(Math.max(...ground) + 1);
        expect([
          result.min.x,
          result.min.z,
          result.max.x,
          result.max.z,
        ]).toEqual([box.min.x, box.min.z, box.max.x, box.max.z]);
        expect(sizeOf(result)).toEqual(sizeOf(box));
        expect(snapToGround(result, probeOf(box, tops, result.min.y))).toEqual(
          result,
        );
      },
    ),
  );
});

it("sits exactly on flat ground and ignores undefined columns", () => {
  fc.assert(
    fc.property(box, fc.integer({ min: 0, max: 63 }), (box, depth) => {
      const top = box.min.y - depth;
      expect(snapToGround(box, () => top)?.min.y).toBe(top + 1);
      expect(
        snapToGround(box, (x, z) =>
          x === box.min.x && z === box.min.z ? top : undefined,
        )?.min.y,
      ).toBe(top + 1);
      expect(snapToGround(box, () => undefined)).toBeUndefined();
    }),
  );
});

it("reads one cell per column once ground sits right under the box", () => {
  fc.assert(
    fc.property(box, (box) => {
      const tops = Array.from({ length: 64 }, () => box.min.y - 1);
      const reads: { lowestY: number }[] = [];
      snapToGround(box, probeOf(box, tops, box.min.y, reads));
      const { x, z } = sizeOf(box);
      const cells = reads.reduce(
        (sum, { lowestY }) => sum + box.min.y - lowestY + 1,
        0,
      );
      expect(reads).toHaveLength(x * z);
      expect(cells).toBeLessThanOrEqual(BUILD_SPEC.groundSearchDepth + x * z);
    }),
  );
});

it("keeps every snap within the probe budget, however wide the footprint", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 256 }),
      fc.integer({ min: 1, max: 256 }),
      (x, z) => {
        const box = boxFromSize({ x: 0, y: 0, z: 0 }, { x, y: 1, z });
        const depth = groundScanDepth(box);
        expect(depth).toBeGreaterThanOrEqual(1);
        expect(depth).toBeLessThanOrEqual(BUILD_SPEC.groundSearchDepth);
        expect(x * z * depth).toBeLessThanOrEqual(
          Math.max(BUILD_SPEC.groundProbeBudget, x * z),
        );
        if (
          x * z * BUILD_SPEC.groundSearchDepth <=
          BUILD_SPEC.groundProbeBudget
        )
          expect(depth).toBe(BUILD_SPEC.groundSearchDepth);
      },
    ),
  );
});

it("reads no more than the budget for a 64 by 64 clipboard over a void", () => {
  const box = boxFromSize({ x: 0, y: 70, z: 0 }, { x: 64, y: 8, z: 64 });
  let cells = 0;
  const result = snapToGround(box, (_x, _z, lowestY) => {
    cells += box.min.y - lowestY + 1;
    return undefined;
  });
  expect(result).toBeUndefined();
  expect(cells).toBeLessThanOrEqual(BUILD_SPEC.groundProbeBudget);
  expect(cells).toBe(64 * 64 * groundScanDepth(box));
});
