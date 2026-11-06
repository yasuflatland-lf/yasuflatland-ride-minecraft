import fc from "fast-check";
import { expect, it } from "vitest";
import type { HorizontalAxis } from "../../../src/domain/build/axis";
import { contains } from "../../../src/domain/build/box";
import {
  type HeightedSpec,
  placementOf,
  volumeOf,
} from "../../../src/domain/build/volume/geometry";
import { fillStylesFor } from "../../../src/domain/build/volume/kind";
import { cellKey } from "../../../src/domain/shared/cells";

const coordinate = fc.integer({ min: -30, max: 30 });
const size = fc.integer({ min: 1, max: 12 });
const spec = fc
  .tuple(
    fc.record({ x: coordinate, y: coordinate, z: coordinate }),
    size,
    size,
    size,
  )
  .map(
    ([min, width, depth, height]): HeightedSpec => ({
      kind: "sideCylinderX",
      base: {
        min,
        max: { x: min.x + width - 1, y: min.y, z: min.z + depth - 1 },
      },
      height,
    }),
  );
const kindOf = (axis: HorizontalAxis) =>
  axis === "x" ? "sideCylinderX" : "sideCylinderZ";

it("counts unique bounded cells symmetric across all three axes, including thin sections", () => {
  fc.assert(
    fc.property(spec, (spec) => {
      const { min, max } = spec.base;
      const bounds = { min, max: { ...max, y: min.y + spec.height - 1 } };
      for (const axis of ["x", "z"] as const) {
        const kind = kindOf(axis);
        for (const fill of fillStylesFor(kind)) {
          const cells = [...placementOf(kind).cells({ ...spec, kind }, fill)];
          const keys = new Set(cells.map(cellKey));
          expect(keys.size).toBe(cells.length);
          expect(placementOf(kind).count(spec, fill)).toBe(cells.length);
          expect(cells.every((c) => contains(bounds, c))).toBe(true);
          for (const cell of cells)
            for (const direction of ["x", "y", "z"] as const) {
              expect(
                keys.has(
                  cellKey({
                    ...cell,
                    [direction]:
                      min[direction] + bounds.max[direction] - cell[direction],
                  }),
                ),
              ).toBe(true);
            }
        }
      }
    }),
  );
});

it("exchanges x and z without changing the cylinder", () => {
  fc.assert(
    fc.property(spec, (spec) => {
      const swap = ({ x, y, z }: typeof spec.base.min) => ({ x: z, y, z: x });
      const swapped = {
        ...spec,
        kind: "sideCylinderZ" as const,
        base: { min: swap(spec.base.min), max: swap(spec.base.max) },
      };
      for (const fill of fillStylesFor(spec.kind)) {
        expect(
          new Set(
            [...placementOf("sideCylinderX").cells(spec, fill)]
              .map(swap)
              .map(cellKey),
          ),
        ).toEqual(
          new Set(
            [...placementOf("sideCylinderZ").cells(swapped, fill)].map(cellKey),
          ),
        );
      }
    }),
  );
});

it("closes Hollow ends and leaves Tube ends open wherever the section has an interior", () => {
  fc.assert(
    fc.property(spec, (spec) => {
      for (const axis of ["x", "z"] as const) {
        const placement = placementOf(kindOf(axis));
        const inside = [...placement.cells(spec, "fill")];
        const filled = new Set(inside.map(cellKey));
        const hollow = new Set(
          [...placement.cells(spec, "hollow")].map(cellKey),
        );
        const tube = new Set([...placement.cells(spec, "tube")].map(cellKey));
        const across = axis === "x" ? "z" : "x";
        for (const cell of inside) {
          const wall = [across, "y"].some((a) =>
            [-1, 1].some(
              (delta) =>
                !filled.has(
                  cellKey({ ...cell, [a]: cell[a as "x" | "y" | "z"] + delta }),
                ),
            ),
          );
          const cap =
            cell[axis] === spec.base.min[axis] ||
            cell[axis] === spec.base.max[axis];
          expect(tube.has(cellKey(cell))).toBe(wall);
          expect(hollow.has(cellKey(cell))).toBe(wall || cap);
        }
      }
    }),
  );
});

it("counts a very long axis from one cross-section scan", () => {
  const long = {
    kind: "sideCylinderX" as const,
    base: { min: { x: 0, y: 0, z: 0 }, max: { x: 999999999, y: 0, z: 4 } },
    height: 5,
  };
  expect(placementOf(long.kind).count(long, "fill")).toBe(21e9);
  expect(placementOf(long.kind).count(long, "tube")).toBe(12e9);
  expect(placementOf(long.kind).count(long, "hollow")).toBe(
    42 + 12 * (1e9 - 2),
  );
});

it("bounds the preview budget and samples the end ellipses or the top and bottom axis lines", () => {
  fc.assert(
    fc.property(spec, fc.integer({ min: -2, max: 180 }), (spec, budget) => {
      for (const axis of ["x", "z"] as const) {
        const volume = volumeOf(kindOf(axis));
        const points = volume.wireframe(spec, budget);
        expect(points.length).toBeLessThanOrEqual(Math.max(0, budget));
        const across = axis === "x" ? "z" : "x";
        const { min, max } = spec.base;
        const center = (min[across] + max[across] + 1) / 2;
        const radius = (max[across] - min[across] + 1) / 2;
        for (const p of points) {
          expect(p[axis]).toBeGreaterThanOrEqual(min[axis] + 0.5);
          expect(p[axis]).toBeLessThanOrEqual(max[axis] + 0.5);
          if (p.y === min.y || p.y === min.y + spec.height) {
            expect(p[across]).toBeCloseTo(center);
          } else {
            expect([min[axis] + 0.5, max[axis] + 0.5]).toContain(p[axis]);
            expect(
              ((p[across] - center) / radius) ** 2 +
                ((p.y - min.y - spec.height / 2) / (spec.height / 2)) ** 2,
            ).toBeCloseTo(1);
          }
        }
        expect(volume.maxHeight(spec.base, 319)).toBe(Math.max(1, 320 - min.y));
      }
    }),
  );
});

it("prioritizes the top and bottom axis lines under a tight outline budget", () => {
  const s = {
    kind: "sideCylinderX" as const,
    base: { min: { x: 0, y: 0, z: 0 }, max: { x: 30, y: 0, z: 4 } },
    height: 5,
  };
  const points = volumeOf(s.kind).wireframe(s, 30);
  expect(points).toHaveLength(30);
  expect(points.every((p) => p.y === 0 || p.y === 5)).toBe(true);
});
