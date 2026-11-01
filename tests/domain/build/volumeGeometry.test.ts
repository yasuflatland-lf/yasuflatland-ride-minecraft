import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxOf, contains } from "../../../src/domain/build/box";
import { roofGeometry } from "../../../src/domain/build/roof/geometry";
import {
  maxRoofHeight,
  type RoofKind,
  roofCells,
  roofCount,
} from "../../../src/domain/build/roof/roof";
import { geometryOf } from "../../../src/domain/build/volume/geometry";
import { fillStylesFor } from "../../../src/domain/build/volume/kind";

const coordinate = fc.integer({ min: -100, max: 100 });
const base = fc
  .tuple(
    fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 12 }),
  )
  .map(([min, width, depth]) =>
    boxOf(min, {
      x: min.x + width - 1,
      y: min.y,
      z: min.z + depth - 1,
    }),
  );
const height = fc.integer({ min: 1, max: 36 });
const registeredKinds = ["gable", "hip"] as const satisfies readonly RoofKind[];

describe("heighted geometry", () => {
  it.each(registeredKinds)(
    "preserves %s roof cells, counts, and height caps",
    (kind) => {
      fc.assert(
        fc.property(base, height, coordinate, (base, height, worldTopY) => {
          const spec = { base, kind, height };
          const geometry = geometryOf(kind);
          for (const fill of fillStylesFor(kind)) {
            const hollow = fill === "hollow";
            expect([...geometry.cells(spec, fill)]).toEqual([
              ...roofCells(spec, hollow),
            ]);
            expect(geometry.count(spec, fill)).toBe(roofCount(spec, hollow));
          }
          expect(geometry.maxHeight(base, worldTopY)).toBe(
            maxRoofHeight(base, worldTopY),
          );
        }),
      );
    },
  );

  it.each(registeredKinds)(
    "counts exactly the cells inside the %s footprint and height",
    (kind) => {
      fc.assert(
        fc.property(base, height, (base, height) => {
          const spec = { base, kind, height };
          const geometry = geometryOf(kind);
          const bounds = {
            min: base.min,
            max: { ...base.max, y: base.min.y + height - 1 },
          };
          for (const fill of fillStylesFor(kind)) {
            const cells = [...geometry.cells(spec, fill)];
            expect(geometry.count(spec, fill)).toBe(cells.length);
            expect(cells.every((cell) => contains(bounds, cell))).toBe(true);
          }
        }),
      );
    },
  );

  it.each(["cylinder", "cube"] as const)(
    "rejects non-roof %s specs in roof geometry",
    (kind) => {
      const spec = {
        base: boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }),
        kind,
        height: 3,
      };
      expect(() => roofGeometry.cells(spec, "fill")).toThrow(Error);
      expect(() => roofGeometry.count(spec, "fill")).toThrow(Error);
      expect(() => roofGeometry.wireframe(spec, 100)).toThrow(Error);
    },
  );

  it.each(registeredKinds)("rejects tube fill for %s", (kind) => {
    const spec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }),
      kind,
      height: 3,
    };
    expect(() => geometryOf(kind).cells(spec, "tube")).toThrow(Error);
    expect(() => geometryOf(kind).count(spec, "tube")).toThrow(Error);
  });
});
