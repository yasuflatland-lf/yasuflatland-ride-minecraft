import fc from "fast-check";
import { expect, it } from "vitest";
import { rectCells } from "../../../../../src/domain/vehicle/cutArea";
import { bladeColumns } from "../../../../../src/domain/vehicle/kinds/bulldozer/blade";
import { BULLDOZER_SPEC } from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";

const rule = BULLDOZER_SPEC.blade;
const pose = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -64, max: 319, noNaN: true }),
  z: fc.double({ min: -1000, max: 1000, noNaN: true }),
});
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
it("cuts 15 columns at heading 0", () =>
  expect(bladeColumns({ x: 0.5, y: 64, z: 0.5 }, 0, rule, false)).toEqual(
    Array.from({ length: 5 }, (_, i) => [-2 + i]).flatMap(([x]) =>
      [1, 2, 3].map((z) => ({ x, z, bottom: 64 })),
    ),
  ));
it("starts a ground cut above the floor block, full or partial", () => {
  for (const [y, bottom] of [
    [63.995, 64],
    [64, 64],
    [64.005, 64],
    [63.9375, 64],
    [63.875, 64],
    [63.5, 64],
    [64.5, 65],
  ])
    for (const c of bladeColumns({ x: 0, y: y ?? 0, z: 0 }, 0, rule, false))
      expect(c.bottom).toBe(bottom);
});
it("never cuts the row of the block the feet stand on", () =>
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      // The floor block's top is within 0.01 of the feet, or the feet are inside its row.
      const floorRow =
        p.y - Math.floor(p.y) < 0.01 ? Math.floor(p.y) - 1 : Math.floor(p.y);
      for (const c of bladeColumns(p, y, rule, false))
        expect(c.bottom).toBeGreaterThan(floorRow);
    }),
  ));
it("starts a flight cut in the row the body sits in", () => {
  for (const y of [63.995, 64.5])
    for (const c of bladeColumns({ x: 0, y, z: 0 }, 0, rule, true))
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
it("keeps rectangle cells and order with the blade bottom and height", () =>
  fc.assert(
    fc.property(
      pose,
      yaw,
      fc.boolean(),
      fc.boolean(),
      (p, y, flying, grounded) => {
        const bottom = grounded
          ? Math.ceil(p.y - 0.01)
          : Math.floor(p.y + 0.01);
        const height = flying
          ? Math.ceil(p.y + rule.bodyHeight) - bottom
          : undefined;
        expect(bladeColumns(p, y, rule, flying, grounded)).toEqual(
          rectCells(p, y, rule).map((cell) => ({
            ...cell,
            bottom,
            ...(height === undefined ? {} : { height }),
          })),
        );
      },
    ),
  ));
