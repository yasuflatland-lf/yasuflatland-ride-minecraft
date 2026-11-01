import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxOf, contains } from "../../../src/domain/build/box";
import { cellsOfShape } from "../../../src/domain/build/shape/shape";
import { cubeGeometry } from "../../../src/domain/build/volume/cube";
import { geometryOf } from "../../../src/domain/build/volume/geometry";
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
    expect(geometryOf("cube")).toBe(cubeGeometry);
  });

  it("fills the footprint through the height with nested shells", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const { min, max } = spec.base;
        const fill = cellSet(cubeGeometry.cells(spec, "fill"));
        const hollow = cellSet(cubeGeometry.cells(spec, "hollow"));
        const tube = cellSet(cubeGeometry.cells(spec, "tube"));
        const volume = (max.x - min.x + 1) * (max.z - min.z + 1) * spec.height;
        expect(cubeGeometry.count(spec, "fill")).toBe(volume);
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
          const cells = [...cubeGeometry.cells(spec, fill)];
          expect(cubeGeometry.count(spec, fill)).toBe(cells.length);
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
          const fill = cellSet(cubeGeometry.cells(thin, "fill"));
          expect(cellSet(cubeGeometry.cells(thin, "hollow"))).toEqual(fill);
          expect(cellSet(cubeGeometry.cells(thin, "tube"))).toEqual(fill);
        },
      ),
    );
  });

  it("fills hollow solids with only one or two layers", () => {
    fc.assert(
      fc.property(spec, fc.integer({ min: 1, max: 2 }), (spec, height) => {
        const thin = { ...spec, height };
        expect(cellSet(cubeGeometry.cells(thin, "hollow"))).toEqual(
          cellSet(cubeGeometry.cells(thin, "fill")),
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
          expect(cellSet(cubeGeometry.cells(spec, fill))).toEqual(
            cellSet(cellsOfShape({ kind: "box", box }, style)),
          );
        }
      }),
    );
  });

  it("caps height at the world top with at least one layer", () => {
    fc.assert(
      fc.property(spec, coordinate, ({ base }, worldTopY) => {
        const height = cubeGeometry.maxHeight(base, worldTopY);
        expect(height).toBeGreaterThanOrEqual(1);
        expect(height).toBe(Math.max(1, worldTopY - base.min.y + 1));
      }),
    );
  });

  it("bounds the wireframe budget and places points at block centres on edges", () => {
    fc.assert(
      fc.property(spec, fc.integer({ min: 0, max: 200 }), (spec, maxPoints) => {
        const points = cubeGeometry.wireframe(spec, maxPoints);
        const box = {
          min: spec.base.min,
          max: { ...spec.base.max, y: spec.base.min.y + spec.height - 1 },
        };
        expect(points.length).toBeLessThanOrEqual(maxPoints);
        for (const point of points) {
          const cell = { x: point.x - 0.5, y: point.y - 0.5, z: point.z - 0.5 };
          expect(Object.values(cell).every(Number.isInteger)).toBe(true);
          expect(contains(box, cell)).toBe(true);
          expect(
            (["x", "y", "z"] as const).filter(
              (axis) =>
                cell[axis] === box.min[axis] || cell[axis] === box.max[axis],
            ).length,
          ).toBeGreaterThanOrEqual(2);
        }
      }),
    );
  });
});
