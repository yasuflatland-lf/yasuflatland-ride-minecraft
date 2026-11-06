import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { boxOf, contains } from "../../../src/domain/build/box";
import {
  cylinderPlacement,
  cylinderVolume,
} from "../../../src/domain/build/volume/cylinder";
import {
  type HeightedSpec,
  placementOf,
  volumeOf,
} from "../../../src/domain/build/volume/geometry";
import { fillStylesFor } from "../../../src/domain/build/volume/kind";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";

const coordinate = fc.integer({ min: -100, max: 100 });
const size = fc.integer({ min: 1, max: 20 });
const origin = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const spec = fc.tuple(origin, size, size, fc.integer({ min: 1, max: 12 })).map(
  ([min, width, depth, height]): HeightedSpec => ({
    base: boxOf(min, {
      x: min.x + width - 1,
      y: min.y,
      z: min.z + depth - 1,
    }),
    kind: "cylinder",
    height,
  }),
);
const columnKey = ({ x, z }: Cell): string => `${x},${z}`;
const neighbours = ({ x, y, z }: Cell): Cell[] => [
  { x: x - 1, y, z },
  { x: x + 1, y, z },
  { x, y, z: z - 1 },
  { x, y, z: z + 1 },
];

describe("cylinder geometry", () => {
  it("is registered as cylinder geometry", () => {
    expect(volumeOf("cylinder")).toBe(cylinderVolume);
    expect(placementOf("cylinder")).toBe(cylinderPlacement);
  });

  it("mirrors every fill across both footprint axes, including even sizes", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const { min, max } = spec.base;
        for (const fill of fillStylesFor("cylinder")) {
          const cells = [...cylinderPlacement.cells(spec, fill)];
          const keys = new Set(cells.map(cellKey));
          for (const cell of cells) {
            expect(
              keys.has(cellKey({ ...cell, x: min.x + max.x - cell.x })),
            ).toBe(true);
            expect(
              keys.has(cellKey({ ...cell, z: min.z + max.z - cell.z })),
            ).toBe(true);
          }
        }
      }),
    );
  });

  it("counts distinct cells within the footprint and upward height layers", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const bounds = {
          min: spec.base.min,
          max: { ...spec.base.max, y: spec.base.min.y + spec.height - 1 },
        };
        for (const fill of fillStylesFor("cylinder")) {
          const cells = [...cylinderPlacement.cells(spec, fill)];
          expect(cylinderPlacement.count(spec, fill)).toBe(cells.length);
          expect(new Set(cells.map(cellKey)).size).toBe(cells.length);
          expect(cells.every((cell) => contains(bounds, cell))).toBe(true);
        }
      }),
    );
  });

  it("nests tube inside hollow inside a full prism with solid caps", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const filled = [...cylinderPlacement.cells(spec, "fill")];
        const hollow = [...cylinderPlacement.cells(spec, "hollow")];
        const tube = [...cylinderPlacement.cells(spec, "tube")];
        const filledKeys = new Set(filled.map(cellKey));
        const hollowKeys = new Set(hollow.map(cellKey));
        expect(hollow.every((cell) => filledKeys.has(cellKey(cell)))).toBe(
          true,
        );
        expect(tube.every((cell) => hollowKeys.has(cellKey(cell)))).toBe(true);
        const columns = new Set(filled.map(columnKey));
        for (let layer = 0; layer < spec.height; layer++) {
          const y = spec.base.min.y + layer;
          const filledLayer = filled.filter((cell) => cell.y === y);
          expect(new Set(filledLayer.map(columnKey))).toEqual(columns);
          if (layer === 0 || layer === spec.height - 1) {
            expect(
              new Set(hollow.filter((cell) => cell.y === y).map(cellKey)),
            ).toEqual(new Set(filledLayer.map(cellKey)));
          }
        }
      }),
    );
  });

  it("walls contain exactly the boundary and stop outside flood reaching the interior", () => {
    fc.assert(
      fc.property(spec, (spec) => {
        const flat = { ...spec, height: 1 };
        const filled = [...cylinderPlacement.cells(flat, "fill")];
        const inside = new Set(filled.map(columnKey));
        const walls = new Set(
          [...cylinderPlacement.cells(flat, "tube")].map(columnKey),
        );
        for (const cell of filled) {
          expect(walls.has(columnKey(cell))).toBe(
            neighbours(cell).some((next) => !inside.has(columnKey(next))),
          );
        }

        const { min, max } = spec.base;
        const outsideBounds = boxOf(
          { ...min, x: min.x - 1, z: min.z - 1 },
          { ...max, x: max.x + 1, z: max.z + 1 },
        );
        const queue = [outsideBounds.min];
        const reached = new Set(queue.map(columnKey));
        for (let i = 0; i < queue.length; i++) {
          for (const next of neighbours(queue[i] as Cell)) {
            const key = columnKey(next);
            if (
              !contains(outsideBounds, next) ||
              walls.has(key) ||
              reached.has(key)
            )
              continue;
            reached.add(key);
            queue.push(next);
          }
        }
        expect(filled.every((cell) => !reached.has(columnKey(cell)))).toBe(
          true,
        );
      }),
    );
  });

  it("keeps a 1x1 footprint as one column for every fill", () => {
    fc.assert(
      fc.property(origin, size, (min, height) => {
        const spec: HeightedSpec = {
          base: boxOf(min, min),
          kind: "cylinder",
          height,
        };
        const expected = Array.from({ length: height }, (_, layer) => ({
          ...min,
          y: min.y + layer,
        }));
        for (const fill of fillStylesFor("cylinder")) {
          expect([...cylinderPlacement.cells(spec, fill)]).toEqual(expected);
          expect(cylinderPlacement.count(spec, fill)).toBe(height);
        }
      }),
    );
  });

  it("never decreases the filled column count when a square grows", () => {
    fc.assert(
      fc.property(origin, size, (min, width) => {
        const square = (width: number): HeightedSpec => ({
          base: boxOf(min, {
            x: min.x + width - 1,
            y: min.y,
            z: min.z + width - 1,
          }),
          kind: "cylinder",
          height: 1,
        });
        expect(
          cylinderPlacement.count(square(width + 1), "fill"),
        ).toBeGreaterThanOrEqual(
          cylinderPlacement.count(square(width), "fill"),
        );
      }),
    );
  });

  it("counts arbitrarily tall solids by columns", () => {
    const spec: HeightedSpec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }),
      kind: "cylinder",
      height: 1_000_000_000,
    };
    expect(cylinderPlacement.count(spec, "fill")).toBe(21 * spec.height);
    expect(cylinderPlacement.count(spec, "tube")).toBe(12 * spec.height);
    expect(cylinderPlacement.count(spec, "hollow")).toBe(
      42 + 12 * (spec.height - 2),
    );
  });

  it("caps height at the inclusive world top with a minimum of one", () => {
    fc.assert(
      fc.property(spec, coordinate, ({ base }, worldTopY) => {
        expect(cylinderVolume.maxHeight(base, worldTopY)).toBe(
          Math.max(1, worldTopY - base.min.y + 1),
        );
      }),
    );
  });

  it.each([
    {
      width: 5,
      fill: [".###.", "#####", "#####", "#####", ".###."],
      wall: [".###.", "#...#", "#...#", "#...#", ".###."],
    },
    {
      width: 4,
      fill: [".##.", "####", "####", ".##."],
      wall: [".##.", "#..#", "#..#", ".##."],
    },
  ])("matches literal $width x $width column maps", ({ width, fill, wall }) => {
    const spec: HeightedSpec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: width - 1, y: 0, z: width - 1 }),
      kind: "cylinder",
      height: 1,
    };
    for (const style of fillStylesFor("cylinder")) {
      const columns = new Set(
        [...cylinderPlacement.cells(spec, style)].map(columnKey),
      );
      const rows = Array.from({ length: width }, (_, z) =>
        Array.from({ length: width }, (_, x) =>
          columns.has(`${x},${z}`) ? "#" : ".",
        ).join(""),
      );
      expect(rows).toEqual(style === "tube" ? wall : fill);
    }
  });

  it("bounds preview samples to the budget and places them on ellipses or extreme lines", () => {
    fc.assert(
      fc.property(spec, fc.integer({ min: -5, max: 150 }), (spec, budget) => {
        const points = cylinderVolume.wireframe(spec, budget);
        expect(points.length).toBeLessThanOrEqual(Math.max(0, budget));
        const { min, max } = spec.base;
        const cx = (min.x + max.x + 1) / 2;
        const cz = (min.z + max.z + 1) / 2;
        const rx = (max.x - min.x + 1) / 2;
        const rz = (max.z - min.z + 1) / 2;
        const bottom = min.y + 0.5;
        const top = min.y + spec.height - 0.5;
        for (const point of points) {
          const dx = (point.x - cx) / rx;
          const dz = (point.z - cz) / rz;
          expect(dx ** 2 + dz ** 2).toBeCloseTo(1);
          expect(point.y).toBeGreaterThanOrEqual(bottom);
          expect(point.y).toBeLessThanOrEqual(top);
          if (point.y !== bottom && point.y !== top) {
            expect(Math.min(Math.abs(dx), Math.abs(dz))).toBeCloseTo(0);
          }
        }
      }),
    );
  });

  it("previews both ellipses and all four vertical extreme lines", () => {
    const spec: HeightedSpec = {
      base: boxOf({ x: -2, y: 7, z: 10 }, { x: 1, y: 7, z: 14 }),
      kind: "cylinder",
      height: 5,
    };
    const points = cylinderVolume.wireframe(spec, 512);
    for (const y of [7.5, 11.5]) {
      expect(
        points.filter((point) => point.y === y).length,
      ).toBeGreaterThanOrEqual(16);
    }
    for (const [x, z] of [
      [2, 12.5],
      [0, 15],
      [-2, 12.5],
      [0, 10],
    ]) {
      expect(
        points.some(
          (point) =>
            Math.abs(point.x - (x as number)) < 1e-10 &&
            Math.abs(point.z - (z as number)) < 1e-10 &&
            point.y > 7.5 &&
            point.y < 11.5,
        ),
      ).toBe(true);
    }
  });

  it("keeps both ellipses dense and drops the vertical lines first under a tight budget", () => {
    const spec: HeightedSpec = {
      base: boxOf({ x: 0, y: 0, z: 0 }, { x: 15, y: 0, z: 15 }),
      kind: "cylinder",
      height: 8,
    };
    const points = cylinderVolume.wireframe(spec, 100);
    expect(points.every((p) => p.y === 0.5 || p.y === 7.5)).toBe(true);
    expect(points.length).toBe(100);
  });
});
