import fc from "fast-check";
import { expect, it } from "vitest";
import {
  boxFromSize,
  boxWithHeight,
  contains,
  rotatedQuarter,
  sizeOf,
  unionOf,
  volume,
} from "../../../src/domain/build/box";

const coordinate = fc.integer({ min: -20, max: 20 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimension = fc.integer({ min: 1, max: 6 });
const size = fc.record({ x: dimension, y: dimension, z: dimension });
const box = fc.tuple(cell, size).map(([min, dimensions]) => ({
  min,
  max: {
    x: min.x + dimensions.x - 1,
    y: min.y + dimensions.y - 1,
    z: min.z + dimensions.z - 1,
  },
}));

it("reconstructs a box from its minimum and size", () => {
  fc.assert(
    fc.property(box, (b) => {
      expect(boxFromSize(b.min, sizeOf(b))).toEqual(b);
    }),
  );
});

it("computes volume from the dimensions", () => {
  fc.assert(
    fc.property(box, (b) => {
      const { x, y, z } = sizeOf(b);
      expect(volume(b)).toBe(x * y * z);
    }),
  );
});

it("restores the size after two quarter rotations", () => {
  fc.assert(
    fc.property(size, (s) => {
      expect(rotatedQuarter(rotatedQuarter(s))).toEqual(s);
    }),
  );
});

it("contains corners and sampled cells from both boxes in their union", () => {
  fc.assert(
    fc.property(box, box, fc.nat(), fc.nat(), fc.nat(), (a, b, x, y, z) => {
      const union = unionOf(a, b);
      for (const source of [a, b]) {
        const dimensions = sizeOf(source);
        const sample = {
          x: source.min.x + (x % dimensions.x),
          y: source.min.y + (y % dimensions.y),
          z: source.min.z + (z % dimensions.z),
        };
        for (const corner of [
          ...[source.min.x, source.max.x].flatMap((cx) =>
            [source.min.y, source.max.y].flatMap((cy) =>
              [source.min.z, source.max.z].map((cz) => ({
                x: cx,
                y: cy,
                z: cz,
              })),
            ),
          ),
          sample,
        ]) {
          expect(contains(union, corner)).toBe(true);
        }
      }
    }),
  );
});

it("sets the height while preserving horizontal dimensions", () => {
  fc.assert(
    fc.property(box, dimension, (base, height) => {
      expect(sizeOf(boxWithHeight(base, height))).toEqual({
        ...sizeOf(base),
        y: height,
      });
    }),
  );
});
