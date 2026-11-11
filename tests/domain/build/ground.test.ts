import fc from "fast-check";
import { expect, it } from "vitest";
import { boxFromSize, sizeOf } from "../../../src/domain/build/box";
import { snapToGround } from "../../../src/domain/build/clipboard/ground";

const coordinate = fc.integer({ min: -100, max: 100 });
const side = fc.integer({ min: 1, max: 8 });
const box = fc
  .tuple(
    fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    fc.record({ x: side, y: side, z: side }),
  )
  .map(([min, size]) => boxFromSize(min, size));

it("sits above every grounded column, preserves the footprint and size, and is idempotent", () => {
  fc.assert(
    fc.property(
      box,
      fc.array(fc.option(coordinate, { nil: undefined }), {
        minLength: 64,
        maxLength: 64,
      }),
      (box, tops) => {
        const topOf = (x: number, z: number) =>
          tops[(z - box.min.z) * 8 + x - box.min.x];
        const result = snapToGround(box, topOf);
        const ground = [];
        for (let z = box.min.z; z <= box.max.z; z++)
          for (let x = box.min.x; x <= box.max.x; x++) {
            const top = topOf(x, z);
            if (top !== undefined) ground.push(top);
          }
        if (!ground.length) {
          expect(result).toBeUndefined();
          return;
        }
        expect(result).toBeDefined();
        if (!result) throw new Error("Expected ground");
        for (const top of ground)
          expect(result.min.y).toBeGreaterThanOrEqual(top + 1);
        expect(result.min.y).toBe(Math.max(...ground) + 1);
        expect([
          result.min.x,
          result.min.z,
          result.max.x,
          result.max.z,
        ]).toEqual([box.min.x, box.min.z, box.max.x, box.max.z]);
        expect(sizeOf(result)).toEqual(sizeOf(box));
        expect(snapToGround(result, topOf)).toEqual(result);
      },
    ),
  );
});

it("sits exactly on flat ground and ignores undefined columns", () => {
  fc.assert(
    fc.property(box, coordinate, (box, top) => {
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
