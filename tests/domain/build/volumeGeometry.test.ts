import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxOf, contains } from "../../../src/domain/build/box";
import {
  roofPlacement,
  roofVolume,
} from "../../../src/domain/build/roof/geometry";
import {
  maxRoofHeight,
  type RoofKind,
  roofCells,
  roofCount,
} from "../../../src/domain/build/roof/roof";
import {
  placementOf,
  volumeOf,
} from "../../../src/domain/build/volume/geometry";
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
          const placement = placementOf(kind);
          for (const fill of fillStylesFor(kind)) {
            const hollow = fill === "hollow";
            expect([...placement.cells(spec, fill)]).toEqual([
              ...roofCells(spec, hollow),
            ]);
            expect(placement.count(spec, fill)).toBe(roofCount(spec, hollow));
          }
          expect(volumeOf(kind).maxHeight(base, worldTopY)).toBe(
            maxRoofHeight(base, worldTopY),
          );
        }),
      );
    },
  );

  it.each(["gable", "hip", "cube", "cylinder", "sphere"] as const)(
    "counts exactly the cells inside the %s footprint and height",
    (kind) => {
      fc.assert(
        fc.property(base, height, (base, height) => {
          const spec = { base, kind, height };
          const placement = placementOf(kind);
          const volume = volumeOf(kind);
          expect(
            volume.maxHeight(base, base.min.y + height - 1),
          ).toBeGreaterThanOrEqual(1);
          expect(volume.wireframe(spec, 100).length).toBeLessThanOrEqual(100);
          const bounds = {
            min: base.min,
            max: { ...base.max, y: base.min.y + height - 1 },
          };
          for (const fill of fillStylesFor(kind)) {
            const cells = [...placement.cells(spec, fill)];
            expect(placement.count(spec, fill)).toBe(cells.length);
            expect(cells.every((cell) => contains(bounds, cell))).toBe(true);
          }
        }),
      );
    },
  );

  it.each(["cylinder", "cube", "sphere"] as const)(
    "rejects non-roof %s specs in roof geometry",
    (kind) => {
      const spec = {
        base: boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }),
        kind,
        height: 3,
      };
      expect(() => roofPlacement.cells(spec, "fill")).toThrow(Error);
      expect(() => roofPlacement.count(spec, "fill")).toThrow(Error);
      expect(() => roofVolume.wireframe(spec, 100)).toThrow(Error);
    },
  );

  it.each(registeredKinds)("rejects tube fill for %s", (kind) => {
    const spec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }),
      kind,
      height: 3,
    };
    expect(() => placementOf(kind).cells(spec, "tube")).toThrow(Error);
    expect(() => placementOf(kind).count(spec, "tube")).toThrow(Error);
  });
});
