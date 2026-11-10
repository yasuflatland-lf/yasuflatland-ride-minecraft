import fc from "fast-check";
import { expect, it } from "vitest";
import { type CellBox, contains, volume } from "../../../src/domain/build/box";
import {
  planRotationAboutCenter,
  type RotationPlan,
} from "../../../src/domain/build/rotation/rotateBox";
import type { Cell } from "../../../src/domain/shared/cells";

const coordinate = fc.integer({ min: -10000, max: 10000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimension = fc.integer({ min: 1, max: 1024 });
const size = fc.record({ x: dimension, y: dimension, z: dimension });

function boxAt(min: Cell, size: Cell): CellBox {
  return Object.freeze({
    min: Object.freeze({ ...min }),
    max: Object.freeze({
      x: min.x + size.x - 1,
      y: min.y + size.y - 1,
      z: min.z + size.z - 1,
    }),
  });
}

it("preserves volume and height with the smallest union containing both boxes", () => {
  fc.assert(
    fc.property(cell, size, (min, size) => {
      const source = boxAt(min, size);
      const before = structuredClone(source);
      const plan: RotationPlan = planRotationAboutCenter(source);
      expect(plan.source).toEqual(source);
      expect(volume(plan.target)).toBe(volume(source));
      expect(plan.target.max.x - plan.target.min.x + 1).toBe(size.z);
      expect(plan.target.max.z - plan.target.min.z + 1).toBe(size.x);
      expect(plan.target.min.y).toBe(source.min.y);
      expect(plan.target.max.y).toBe(source.max.y);
      expect(Object.isFrozen(plan)).toBe(true);
      for (const box of [plan.source, plan.target, plan.union]) {
        expect(Object.isFrozen(box)).toBe(true);
        expect(Object.isFrozen(box.min)).toBe(true);
        expect(Object.isFrozen(box.max)).toBe(true);
        expect(contains(plan.union, box.min)).toBe(true);
        expect(contains(plan.union, box.max)).toBe(true);
      }
      for (const axis of ["x", "y", "z"] as const) {
        expect(plan.union.min[axis]).toBe(
          Math.min(source.min[axis], plan.target.min[axis]),
        );
        expect(plan.union.max[axis]).toBe(
          Math.max(source.max[axis], plan.target.max[axis]),
        );
        const centerShift =
          plan.target.min[axis] +
          plan.target.max[axis] -
          source.min[axis] -
          source.max[axis];
        expect(centerShift).toBeGreaterThanOrEqual(-1);
        expect(centerShift).toBeLessThanOrEqual(0);
      }
      expect(source).toEqual(before);
    }),
  );
});

it("keeps a square footprint in the same box", () => {
  fc.assert(
    fc.property(cell, dimension, dimension, (min, side, height) => {
      const source = boxAt(min, { x: side, y: height, z: side });
      expect(planRotationAboutCenter(source).target).toEqual(source);
    }),
  );
});

it("returns after four turns with zero drift for equal parity and two cells otherwise", () => {
  fc.assert(
    fc.property(cell, size, (min, size) => {
      const source = boxAt(min, size);
      let target = source;
      for (let i = 0; i < 4; i++) {
        target = planRotationAboutCenter(target).target;
      }
      // Flooring both offsets loses half a cell per turn for mixed parity;
      // issue #1520's one-cell four-turn bound conflicts with its formula.
      const drift = size.x % 2 === size.z % 2 ? 0 : -2;
      expect(target).toEqual(
        boxAt({ x: min.x + drift, y: min.y, z: min.z + drift }, size),
      );
    }),
  );
});

it.each([
  { size: { x: 5, y: 3, z: 3 }, offset: { x: 1, z: -1 } },
  { size: { x: 4, y: 2, z: 2 }, offset: { x: 1, z: -1 } },
  { size: { x: 2, y: 1, z: 1 }, offset: { x: 0, z: -1 } },
  { size: { x: 1, y: 4, z: 2 }, offset: { x: -1, z: 0 } },
])("rotates $size about its floored center", ({ size, offset }) => {
  const min = { x: -10, y: -5, z: 7 };
  expect(planRotationAboutCenter(boxAt(min, size)).target).toEqual(
    boxAt(
      { x: min.x + offset.x, y: min.y, z: min.z + offset.z },
      { x: size.z, y: size.y, z: size.x },
    ),
  );
});

it("does not freeze or retain mutable input corners", () => {
  const source = { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 2 } };
  const before = structuredClone(source);
  const plan = planRotationAboutCenter(source);
  expect(Object.isFrozen(source)).toBe(false);
  expect(Object.isFrozen(source.min)).toBe(false);
  expect(Object.isFrozen(source.max)).toBe(false);
  source.min.x = 100;
  source.max.z = 100;
  expect(plan.source).toEqual(before);
});
