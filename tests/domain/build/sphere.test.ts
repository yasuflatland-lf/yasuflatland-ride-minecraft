import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxOf, type CellBox, contains } from "../../../src/domain/build/box";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  type HeightedSpec,
  placementOf,
  volumeOf,
} from "../../../src/domain/build/volume/geometry";
import {
  spherePlacement,
  sphereVolume,
} from "../../../src/domain/build/volume/sphere";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";

const coordinate = fc.integer({ min: -100, max: 100 });
const origin = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const specOf = (
  min: Cell,
  width: number,
  height: number,
  depth: number,
): HeightedSpec => ({
  base: boxOf(min, {
    x: min.x + width - 1,
    y: min.y,
    z: min.z + depth - 1,
  }),
  kind: "sphere",
  height,
});
const size = fc.integer({ min: 1, max: 14 });
const spec = fc
  .tuple(origin, size, size, size)
  .map(([min, width, height, depth]) => specOf(min, width, height, depth));

const boundsOf = ({ base, height }: HeightedSpec): CellBox => ({
  min: base.min,
  max: { ...base.max, y: base.min.y + height - 1 },
});
const neighbours = ({ x, y, z }: Cell): Cell[] => [
  { x: x - 1, y, z },
  { x: x + 1, y, z },
  { x, y: y - 1, z },
  { x, y: y + 1, z },
  { x, y, z: z - 1 },
  { x, y, z: z + 1 },
];
const cellsOf = (spec: HeightedSpec, fill: "fill" | "hollow") => [
  ...spherePlacement.cells(spec, fill),
];

/** The rule itself, evaluated cell by cell, to check the per-column range. */
function insideByRule(spec: HeightedSpec, { x, y, z }: Cell): boolean {
  const { min, max } = boundsOf(spec);
  const w = max.x - min.x + 1;
  const h = max.y - min.y + 1;
  const d = max.z - min.z + 1;
  const dx = 2 * x - min.x - max.x;
  const dy = 2 * y - min.y - max.y;
  const dz = 2 * z - min.z - max.z;
  return (
    dx ** 2 * h ** 2 * d ** 2 +
      dy ** 2 * w ** 2 * d ** 2 +
      dz ** 2 * w ** 2 * h ** 2 <=
    w ** 2 * h ** 2 * d ** 2
  );
}

function everyCellOf({ min, max }: CellBox): Cell[] {
  const cells: Cell[] = [];
  for (let x = min.x; x <= max.x; x++)
    for (let y = min.y; y <= max.y; y++)
      for (let z = min.z; z <= max.z; z++) cells.push({ x, y, z });
  return cells;
}

const reachesEveryEnd = (spec: HeightedSpec): void => {
  const { min, max } = boundsOf(spec);
  const cells = cellsOf(spec, "fill");
  for (const axis of ["x", "y", "z"] as const) {
    expect(cells.some((cell) => cell[axis] === min[axis])).toBe(true);
    expect(cells.some((cell) => cell[axis] === max[axis])).toBe(true);
  }
};

describe("sphere geometry", () => {
  it("is registered as sphere geometry", () => {
    expect(volumeOf("sphere")).toBe(sphereVolume);
    expect(placementOf("sphere")).toBe(spherePlacement);
  });

  it("selects exactly the cells the ellipsoid rule accepts, inside the box", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const bounds = boundsOf(spec);
        const cells = cellsOf(spec, "fill");
        expect(cells.every((cell) => contains(bounds, cell))).toBe(true);
        expect(new Set(cells.map(cellKey))).toEqual(
          new Set(
            everyCellOf(bounds)
              .filter((cell) => insideByRule(spec, cell))
              .map(cellKey),
          ),
        );
      }),
    );
  });

  it("mirrors both fills across all three axes", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const { min, max } = boundsOf(spec);
        for (const fill of ["fill", "hollow"] as const) {
          const cells = cellsOf(spec, fill);
          const keys = new Set(cells.map(cellKey));
          for (const axis of ["x", "y", "z"] as const) {
            for (const cell of cells) {
              const mirrored = {
                ...cell,
                [axis]: min[axis] + max[axis] - cell[axis],
              };
              expect(keys.has(cellKey(mirrored))).toBe(true);
            }
          }
        }
      }),
    );
  });

  it("reaches both ends of every axis for cubes and boxes with all odd sides", () => {
    const cube = fc
      .tuple(origin, size)
      .map(([min, side]) => specOf(min, side, side, side));
    const oddSize = fc.integer({ min: 0, max: 6 }).map((n) => 2 * n + 1);
    const oddBox = fc
      .tuple(origin, oddSize, oddSize, oddSize)
      .map(([min, width, height, depth]) => specOf(min, width, height, depth));
    fc.assert(fc.property(fc.oneof(cube, oddBox), reachesEveryEnd));
  });

  it("leaves both x end layers empty in a 4x2x2 box", () => {
    const spec = specOf({ x: 0, y: 0, z: 0 }, 4, 2, 2);
    const cells = cellsOf(spec, "fill");
    expect(cells).toHaveLength(8);
    expect(cells.some((cell) => cell.x === spec.base.min.x)).toBe(false);
    expect(cells.some((cell) => cell.x === spec.base.max.x)).toBe(false);
  });

  it("counts the same number of distinct cells it places", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        for (const fill of ["fill", "hollow"] as const) {
          const cells = cellsOf(spec, fill);
          expect(spherePlacement.count(spec, fill)).toBe(cells.length);
          expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
        }
      }),
    );
  });

  it("keeps in Hollow exactly the cells with an outside neighbour", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const filled = cellsOf(spec, "fill");
        const inside = new Set(filled.map(cellKey));
        const shell = new Set(cellsOf(spec, "hollow").map(cellKey));
        for (const cell of filled) {
          expect(shell.has(cellKey(cell))).toBe(
            neighbours(cell).some((next) => !inside.has(cellKey(next))),
          );
        }
      }),
    );
  });

  it("seals the Hollow interior from the outside", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const { min, max } = boundsOf(spec);
        const shell = new Set(cellsOf(spec, "hollow").map(cellKey));
        const inside = new Set(cellsOf(spec, "fill").map(cellKey));
        const margin = {
          min: { x: min.x - 1, y: min.y - 1, z: min.z - 1 },
          max: { x: max.x + 1, y: max.y + 1, z: max.z + 1 },
        };
        const seen = new Set([cellKey(margin.min)]);
        const frontier = [margin.min];
        for (let cell = frontier.pop(); cell; cell = frontier.pop()) {
          expect(inside.has(cellKey(cell))).toBe(false);
          for (const next of neighbours(cell)) {
            const key = cellKey(next);
            if (!contains(margin, next) || shell.has(key) || seen.has(key))
              continue;
            seen.add(key);
            frontier.push(next);
          }
        }
      }),
    );
  });

  it("counts a box too large to build close to the ellipsoid volume", () => {
    const huge = specOf({ x: 0, y: -64, z: 0 }, 300, 384, 300);
    const placed = spherePlacement.count(huge, "fill");
    expect(placed).toBeGreaterThan(BUILD_SPEC.maxVolume);
    expect(placed / ((Math.PI / 6) * 300 * 384 * 300)).toBeCloseTo(1, 1);
  });

  it("rejects tube fill", () => {
    const sphere = specOf({ x: 0, y: 0, z: 0 }, 3, 3, 3);
    expect(() => spherePlacement.cells(sphere, "tube")).toThrow(Error);
    expect(() => spherePlacement.count(sphere, "tube")).toThrow(Error);
  });
});

describe("sphere outline", () => {
  it("stays within the budget and inside the outer box", () => {
    fc.assert(
      fc.property(spec, fc.integer({ min: 0, max: 600 }), (spec, budget) => {
        const { min, max } = boundsOf(spec);
        const points = sphereVolume.wireframe(spec, budget);
        expect(points.length).toBeLessThanOrEqual(budget);
        for (const point of points) {
          for (const axis of ["x", "y", "z"] as const) {
            expect(point[axis]).toBeGreaterThanOrEqual(min[axis] - 1e-9);
            expect(point[axis]).toBeLessThanOrEqual(max[axis] + 1 + 1e-9);
          }
        }
      }),
    );
  });

  it("draws only the equator at height one", () => {
    fc.assert(
      fc.property(origin, size, size, (min, width, depth) => {
        const points = sphereVolume.wireframe(
          specOf(min, width, 1, depth),
          BUILD_SPEC.outlineMaxPoints,
        );
        expect(points.length).toBeGreaterThan(0);
        expect(points.every((point) => point.y === min.y + 0.5)).toBe(true);
      }),
    );
  });

  it("adds both vertical ellipses to reach the top and bottom", () => {
    const sphere = specOf({ x: 0, y: 0, z: 0 }, 8, 8, 8);
    const points = sphereVolume.wireframe(sphere, BUILD_SPEC.outlineMaxPoints);
    const ys = points.map((point) => point.y);
    expect(Math.min(...ys)).toBeCloseTo(0, 0);
    expect(Math.max(...ys)).toBeCloseTo(8, 0);
    const onEquator = points.filter((point) => point.y === 4);
    expect(onEquator.length).toBeGreaterThanOrEqual(
      Math.ceil(Math.PI * 8 * BUILD_SPEC.denseOutlinePerBlock),
    );
    expect(points.some((point) => point.x === 4 && point.y !== 4)).toBe(true);
    expect(points.some((point) => point.z === 4 && point.y !== 4)).toBe(true);
  });

  it.each([
    [1, 326, 8],
    [326, 1, 8],
    [1, 479, 12],
    [479, 1, 12],
  ])(
    "reaches both poles on a %ix%i footprint at height %i",
    (width, depth, height) => {
      const points = sphereVolume.wireframe(
        specOf({ x: 0, y: 0, z: 0 }, width, height, depth),
        BUILD_SPEC.outlineMaxPoints,
      );
      expect(points.length).toBeLessThanOrEqual(BUILD_SPEC.outlineMaxPoints);
      for (const [axis, center] of [
        ["x", width / 2],
        ["z", depth / 2],
      ] as const) {
        const ys = points
          .filter((point) => point[axis] === center && point.y !== height / 2)
          .map((point) => point.y);
        expect(Math.min(...ys)).toBe(0);
        expect(Math.max(...ys)).toBe(height);
      }
    },
  );

  it("keeps both vertical ellipses reaching the top and bottom on large spheres", () => {
    const largeSide = fc.integer({ min: 41, max: 512 });
    const thinSide = fc.integer({ min: 1, max: 4 });
    const footprint = fc.oneof(
      fc.tuple(largeSide, largeSide),
      fc.tuple(thinSide, largeSide),
      fc.tuple(largeSide, thinSide),
    );
    fc.assert(
      fc.property(
        origin,
        footprint,
        fc.oneof(
          fc.integer({ min: 2, max: 4 }),
          fc.integer({ min: 2, max: 384 }),
        ),
        (min, [width, depth], height) => {
          const points = sphereVolume.wireframe(
            specOf(min, width, height, depth),
            BUILD_SPEC.outlineMaxPoints,
          );
          expect(points.length).toBeLessThanOrEqual(
            BUILD_SPEC.outlineMaxPoints,
          );
          const centerY = min.y + height / 2;
          for (const [axis, center] of [
            ["x", min.x + width / 2],
            ["z", min.z + depth / 2],
          ] as const) {
            const ys = points
              .filter((point) => point[axis] === center && point.y !== centerY)
              .map((point) => point.y);
            expect(ys.length).toBeGreaterThan(0);
            expect(Math.min(...ys)).toBeCloseTo(min.y, 0);
            expect(Math.max(...ys)).toBeCloseTo(min.y + height, 0);
          }
        },
      ),
      {
        examples: [
          [{ x: 0, y: 0, z: 0 }, [2, 355], 2],
          [{ x: 0, y: 0, z: 0 }, [512, 2], 2],
          [{ x: 0, y: 0, z: 0 }, [1, 254], 2],
          [{ x: 0, y: 0, z: 0 }, [2, 406], 3],
          [{ x: 0, y: 0, z: 0 }, [406, 3], 2],
          [{ x: 0, y: 0, z: 0 }, [4, 508], 2],
        ],
      },
    );
  });

  it("offers the same height range as the other solids", () => {
    const base = boxOf({ x: 0, y: 300, z: 0 }, { x: 3, y: 300, z: 3 });
    expect(sphereVolume.maxHeight(base, BUILD_SPEC.worldTopY)).toBe(20);
    expect(
      sphereVolume.maxHeight(
        boxOf({ x: 0, y: 330, z: 0 }, { x: 3, y: 330, z: 3 }),
        BUILD_SPEC.worldTopY,
      ),
    ).toBe(1);
  });
});
