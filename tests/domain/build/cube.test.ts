import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxOf } from "../../../src/domain/build/box";
import { cellsOfShape } from "../../../src/domain/build/shape/shape";
import {
  cubePlacement,
  cubeVolume,
} from "../../../src/domain/build/volume/cube";
import {
  placementOf,
  volumeOf,
} from "../../../src/domain/build/volume/geometry";
import { fillStylesFor } from "../../../src/domain/build/volume/kind";
import type { Cell } from "../../../src/domain/shared/cells";

const coordinate = fc.integer({ min: -100, max: 100 });
const side = fc.integer({ min: 1, max: 12 });
const spec = fc
  .tuple(
    fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    side,
    side,
    side,
  )
  .map(([min, width, depth, height]) => ({
    base: boxOf(min, { x: min.x + width - 1, y: min.y, z: min.z + depth - 1 }),
    kind: "cube" as const,
    height,
  }));

const cellSet = (cells: Iterable<Cell>) =>
  new Set([...cells].map(({ x, y, z }) => `${x},${y},${z}`));

describe("cube geometry", () => {
  it("is registered", () => {
    expect(volumeOf("cube")).toBe(cubeVolume);
    expect(placementOf("cube")).toBe(cubePlacement);
  });

  it("fills the footprint through the height with nested shells", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const { min, max } = spec.base;
        const fill = cellSet(cubePlacement.cells(spec, "fill"));
        const hollow = cellSet(cubePlacement.cells(spec, "hollow"));
        const tube = cellSet(cubePlacement.cells(spec, "tube"));
        const volume = (max.x - min.x + 1) * (max.z - min.z + 1) * spec.height;
        expect(cubePlacement.count(spec, "fill")).toBe(volume);
        expect(fill.size).toBe(volume);
        expect([...tube].every((cell) => hollow.has(cell))).toBe(true);
        expect([...hollow].every((cell) => fill.has(cell))).toBe(true);
      }),
    );
  });

  it("counts exactly the cells for every fill style", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        for (const fill of fillStylesFor("cube")) {
          const cells = [...cubePlacement.cells(spec, fill)];
          expect(cubePlacement.count(spec, fill)).toBe(cells.length);
          expect(cellSet(cells).size).toBe(cells.length);
        }
      }),
    );
  });

  it("fills thin footprints for hollow and tube", () => {
    fc.assert(
      fc.property(
        spec,
        fc.constantFrom("x", "z"),
        fc.integer({ min: 1, max: 2 }),
        (spec, axis, thickness) => {
          const thin = {
            ...spec,
            base: {
              ...spec.base,
              max: {
                ...spec.base.max,
                [axis]: spec.base.min[axis] + thickness - 1,
              },
            },
          };
          const fill = cellSet(cubePlacement.cells(thin, "fill"));
          expect(cellSet(cubePlacement.cells(thin, "hollow"))).toEqual(fill);
          expect(cellSet(cubePlacement.cells(thin, "tube"))).toEqual(fill);
        },
      ),
    );
  });

  it("fills hollow solids with only one or two layers", () => {
    fc.assert(
      fc.property(spec, fc.integer({ min: 1, max: 2 }), (spec, height) => {
        const thin = { ...spec, height };
        expect(cellSet(cubePlacement.cells(thin, "hollow"))).toEqual(
          cellSet(cubePlacement.cells(thin, "fill")),
        );
      }),
    );
  });

  it("matches box faces and walls on the same bounds", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const box = {
          min: spec.base.min,
          max: { ...spec.base.max, y: spec.base.min.y + spec.height - 1 },
        };
        for (const [fill, style] of [
          ["hollow", "faces"],
          ["tube", "walls"],
        ] as const) {
          expect(cellSet(cubePlacement.cells(spec, fill))).toEqual(
            cellSet(cellsOfShape({ kind: "box", box }, style)),
          );
        }
      }),
    );
  });

  it("caps height at the world top with at least one layer", () => {
    fc.assert(
      fc.property(spec, coordinate, ({ base }, worldTopY) => {
        const height = cubeVolume.maxHeight(base, worldTopY);
        expect(height).toBeGreaterThanOrEqual(1);
        expect(height).toBe(Math.max(1, worldTopY - base.min.y + 1));
      }),
    );
  });

  it("bounds the wireframe budget and keeps points on the box edges between block centres", () => {
    fc.assert(
      fc.property(spec, fc.integer({ min: 0, max: 600 }), (spec, maxPoints) => {
        const points = cubeVolume.wireframe(spec, maxPoints);
        const { min } = spec.base;
        const max = {
          ...spec.base.max,
          y: spec.base.min.y + spec.height - 1,
        };
        expect(points.length).toBeLessThanOrEqual(maxPoints);
        for (const p of points) {
          const onExtreme = (["x", "y", "z"] as const).filter(
            (axis) =>
              p[axis] === min[axis] + 0.5 || p[axis] === max[axis] + 0.5,
          );
          expect(onExtreme.length).toBeGreaterThanOrEqual(2);
          for (const axis of ["x", "y", "z"] as const) {
            expect(p[axis]).toBeGreaterThanOrEqual(min[axis] + 0.5);
            expect(p[axis]).toBeLessThanOrEqual(max[axis] + 0.5);
          }
        }
      }),
    );
  });

  it("samples the top and bottom edges four times per block and the vertical edges once per block", () => {
    const spec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 2 }),
      kind: "cube" as const,
      height: 6,
    };
    const points = cubeVolume.wireframe(spec, 512);
    // The top edge along x from x=0.5 to x=4.5 at z=0.5.
    const topEdge = points.filter((p) => p.y === 5.5 && p.z === 0.5);
    expect(topEdge.length).toBeGreaterThanOrEqual(4 * 4 + 1);
    const vertical = points.filter(
      (p) => p.x === 0.5 && p.z === 0.5 && p.y > 0.5 && p.y < 5.5,
    );
    expect(vertical.length).toBe(4);
  });

  it("gives up the vertical edges before the horizontal ones under a tight budget", () => {
    const spec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 9 }),
      kind: "cube" as const,
      height: 10,
    };
    const points = cubeVolume.wireframe(spec, 200);
    expect(points.every((p) => p.y === 0.5 || p.y === 9.5)).toBe(true);
  });
});
