import fc from "fast-check";
import { expect, it } from "vitest";
import {
  forward,
  localPoint,
  rightOf,
  type Vec2,
} from "../../../src/domain/shared/vec";
import {
  boxColumns,
  type CutRect,
  rectCells,
} from "../../../src/domain/vehicle/cutArea";

const pose = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -64, max: 319, noNaN: true }),
  z: fc.double({ min: -1000, max: 1000, noNaN: true }),
});
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const rectangle = fc
  .record({
    near: fc.integer({ min: -80, max: 80 }).map((n) => n / 8),
    depth: fc.integer({ min: 1, max: 80 }).map((n) => n / 8),
    halfWidth: fc.integer({ min: 1, max: 40 }).map((n) => n / 8),
  })
  .map(({ near, depth, halfWidth }) => ({
    near,
    far: near + depth,
    halfWidth,
  }));
function corners(p: Vec2, y: number, rule: CutRect) {
  return [
    localPoint(p, forward(y), rule.near, -rule.halfWidth),
    localPoint(p, forward(y), rule.near, rule.halfWidth),
    localPoint(p, forward(y), rule.far, rule.halfWidth),
    localPoint(p, forward(y), rule.far, -rule.halfWidth),
  ];
}
function touches(rect: Vec2[], x: number, z: number, tolerance = 1e-9) {
  const square = [
    { x, z },
    { x: x + 1, z },
    { x: x + 1, z: z + 1 },
    { x, z: z + 1 },
  ];
  const axes = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
  ];
  for (let i = 0; i < 2; i++) {
    const a = rect[i];
    const b = rect[i + 1];
    if (a && b) axes.push({ x: -(b.z - a.z), z: b.x - a.x });
  }
  return axes.every((a) => {
    const r = rect.map((p) => p.x * a.x + p.z * a.z),
      s = square.map((p) => p.x * a.x + p.z * a.z);
    return (
      Math.max(...r) >= Math.min(...s) - tolerance &&
      Math.max(...s) >= Math.min(...r) - tolerance
    );
  });
}
it("covers every point of the rectangle", () =>
  fc.assert(
    fc.property(
      pose,
      yaw,
      rectangle,
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
      (p, y, rule, a, s) => {
        const q = localPoint(
          p,
          forward(y),
          rule.near + a * (rule.far - rule.near),
          s * rule.halfWidth,
        );
        expect(rectCells(p, y, rule)).toContainEqual({
          x: Math.floor(q.x),
          z: Math.floor(q.z),
        });
      },
    ),
  ));
it("returns only cells whose square touches the rectangle", () =>
  fc.assert(
    fc.property(pose, yaw, rectangle, (p, y, rule) => {
      for (const c of rectCells(p, y, rule))
        expect(touches(corners(p, y, rule), c.x, c.z)).toBe(true);
    }),
  ));
it("returns each cell once", () =>
  fc.assert(
    fc.property(pose, yaw, rectangle, (p, y, rule) => {
      const c = rectCells(p, y, rule);
      expect(new Set(c.map((c) => `${c.x},${c.z}`)).size).toBe(c.length);
    }),
  ));
it("stays within the bounding box of the rectangle", () =>
  fc.assert(
    fc.property(pose, yaw, rectangle, (p, y, rule) => {
      const r = corners(p, y, rule);
      for (const c of rectCells(p, y, rule)) {
        expect(c.x + 1).toBeGreaterThanOrEqual(
          Math.min(...r.map((p) => p.x)) - 1e-9,
        );
        expect(c.x).toBeLessThanOrEqual(Math.max(...r.map((p) => p.x)) + 1e-9);
        expect(c.z + 1).toBeGreaterThanOrEqual(
          Math.min(...r.map((p) => p.z)) - 1e-9,
        );
        expect(c.z).toBeLessThanOrEqual(Math.max(...r.map((p) => p.z)) + 1e-9);
      }
    }),
  ));

it("keeps cell centers within the rectangle grown by a half diagonal", () =>
  fc.assert(
    fc.property(pose, yaw, rectangle, (p, y, rule) => {
      const f = forward(y);
      const r = rightOf(f);
      const radius = Math.SQRT1_2 + 1e-9;
      for (const cell of rectCells(p, y, rule)) {
        const dx = cell.x + 0.5 - p.x;
        const dz = cell.z + 0.5 - p.z;
        const ahead = dx * f.x + dz * f.z;
        const side = dx * r.x + dz * r.z;
        expect(ahead).toBeGreaterThanOrEqual(rule.near - radius);
        expect(ahead).toBeLessThanOrEqual(rule.far + radius);
        expect(Math.abs(side)).toBeLessThanOrEqual(rule.halfWidth + radius);
      }
    }),
  ));
it("includes every cell whose square overlaps the rectangle", () =>
  fc.assert(
    fc.property(pose, yaw, rectangle, (p, y, rule) => {
      const polygon = corners(p, y, rule);
      const cells = new Set(rectCells(p, y, rule).map((c) => `${c.x},${c.z}`));
      const xs = polygon.map((p) => p.x);
      const zs = polygon.map((p) => p.z);
      for (
        let x = Math.floor(Math.min(...xs)) - 1;
        x <= Math.ceil(Math.max(...xs));
        x++
      )
        for (
          let z = Math.floor(Math.min(...zs)) - 1;
          z <= Math.ceil(Math.max(...zs));
          z++
        ) {
          // Exclude roundoff-only overlaps; exact touching is checked on the integer grid below.
          if (touches(polygon, x, z, -1e-9))
            expect(cells.has(`${x},${z}`)).toBe(true);
        }
    }),
  ));
it("includes both sides of touching integer edges in x then z order", () =>
  fc.assert(
    fc.property(
      fc.integer({ min: -1000, max: 1000 }),
      fc.integer({ min: -1000, max: 1000 }),
      (x, z) => {
        expect(
          rectCells({ x, y: 0, z }, 0, { near: -1, far: 2, halfWidth: 1 }),
        ).toEqual(
          Array.from({ length: 4 }, (_, i) => x - 2 + i).flatMap((x) =>
            Array.from({ length: 5 }, (_, i) => ({ x, z: z - 2 + i })),
          ),
        );
      },
    ),
  ));
it("rotates the selected set with a quarter turn of the pose", () =>
  fc.assert(
    fc.property(pose, yaw, rectangle, (p, y, rule) => {
      const polygon = corners(p, y, rule);
      const rotated = new Set(
        rectCells({ x: -p.z, y: p.y, z: p.x }, y + 90, rule).map(
          (c) => `${c.z},${-c.x - 1}`,
        ),
      );
      const original = new Set(
        rectCells(p, y, rule).map((c) => `${c.x},${c.z}`),
      );
      // The two poses round differently, so a cell that only touches an edge may
      // fall on either side; every other cell must match.
      for (const key of new Set([...rotated, ...original])) {
        if (rotated.has(key) === original.has(key)) continue;
        const [x = 0, z = 0] = key.split(",").map(Number);
        expect(touches(polygon, x, z, 1e-9)).toBe(true);
        expect(touches(polygon, x, z, -1e-9)).toBe(false);
      }
    }),
  ));
it("gives every box column the fixed bottom and height in cell order", () =>
  fc.assert(
    fc.property(
      pose,
      yaw,
      rectangle,
      fc.integer({ min: -64, max: 319 }),
      fc.integer({ min: 1, max: 384 }),
      (p, y, rule, bottom, height) => {
        const columns = boxColumns(p, y, rule, bottom, height);
        expect(columns.map(({ x, z }) => ({ x, z }))).toEqual(
          rectCells(p, y, rule),
        );
        for (const column of columns) {
          expect(column.bottom).toBe(bottom);
          expect(column.height).toBe(height);
        }
      },
    ),
  ));
