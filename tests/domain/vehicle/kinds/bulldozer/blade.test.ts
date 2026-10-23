import fc from "fast-check";
import { expect, it } from "vitest";
import {
  forward,
  localPoint,
  type Vec2,
} from "../../../../../src/domain/shared/vec";
import { bladeColumns } from "../../../../../src/domain/vehicle/kinds/bulldozer/blade";
import { BULLDOZER_SPEC } from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";

const rule = BULLDOZER_SPEC.blade;
const pose = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -64, max: 319, noNaN: true }),
  z: fc.double({ min: -1000, max: 1000, noNaN: true }),
});
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
function corners(p: Vec2, y: number) {
  return [
    localPoint(p, forward(y), rule.near, -rule.halfWidth),
    localPoint(p, forward(y), rule.near, rule.halfWidth),
    localPoint(p, forward(y), rule.far, rule.halfWidth),
    localPoint(p, forward(y), rule.far, -rule.halfWidth),
  ];
}
function touches(rect: Vec2[], x: number, z: number) {
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
      Math.max(...r) >= Math.min(...s) - 1e-9 &&
      Math.max(...s) >= Math.min(...r) - 1e-9
    );
  });
}
it("cuts 15 columns at heading 0", () =>
  expect(bladeColumns({ x: 0.5, y: 64, z: 0.5 }, 0, rule, false)).toEqual(
    Array.from({ length: 5 }, (_, i) => [-2 + i]).flatMap(([x]) =>
      [1, 2, 3].map((z) => ({ x, z, bottom: 64 })),
    ),
  ));
it("covers every point of the blade rectangle", () =>
  fc.assert(
    fc.property(
      pose,
      yaw,
      fc.double({ min: 1, max: 2.9, noNaN: true }),
      fc.double({ min: -2.32, max: 2.32, noNaN: true }),
      (p, y, a, s) => {
        const q = localPoint(p, forward(y), a, s);
        expect(bladeColumns(p, y, rule, false)).toContainEqual({
          x: Math.floor(q.x),
          z: Math.floor(q.z),
          bottom: Math.floor(p.y + 0.01),
        });
      },
    ),
  ));
it("returns only columns whose square touches the rectangle", () =>
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      for (const c of bladeColumns(p, y, rule, false))
        expect(touches(corners(p, y), c.x, c.z)).toBe(true);
    }),
  ));
it("returns each column once", () =>
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      const c = bladeColumns(p, y, rule, false);
      expect(new Set(c.map((c) => `${c.x},${c.z}`)).size).toBe(c.length);
    }),
  ));
it("starts every column at floor(y + 0.01)", () => {
  for (const y of [63.995, 64.5])
    for (const c of bladeColumns({ x: 0, y, z: 0 }, 0, rule, false))
      expect(c.bottom).toBe(64);
});
it("cuts to the sky on the ground and up to the top of the body in flight", () => {
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      for (const c of bladeColumns(p, y, rule, false))
        expect(c.height).toBeUndefined();
      for (const c of bladeColumns(p, y, rule, true))
        expect(c.bottom + (c.height ?? 0)).toBe(Math.ceil(p.y + 2.9));
    }),
  );
  for (const [y, h] of [
    [64, 3],
    [64.5, 4],
  ])
    for (const c of bladeColumns({ x: 0, y: y ?? 0, z: 0 }, 0, rule, true))
      expect(c.height).toBe(h);
});
it("stays within the bounding box of the rectangle", () =>
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      const r = corners(p, y);
      for (const c of bladeColumns(p, y, rule, false)) {
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
