import fc from "fast-check";
import { expect, it } from "vitest";
import { rectCells } from "../../../../../src/domain/vehicle/cutArea";
import {
  bladeColumns,
  type CutReach,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/blade";
import {
  BULLDOZER_SPEC,
  BULLDOZER_WIDE_BLADE,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";

const rule = BULLDOZER_SPEC.blade;
const RUN: CutReach = { kind: "run" };
const FLYING: CutReach = { kind: "fixed", grounded: false };
const pose = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -64, max: 319, noNaN: true }),
  z: fc.double({ min: -1000, max: 1000, noNaN: true }),
});
const yaw = fc.double({ min: -180, max: 180, noNaN: true });
const reach: fc.Arbitrary<CutReach> = fc.oneof(
  fc.constant(RUN),
  fc.boolean().map((grounded) => ({ kind: "fixed" as const, grounded })),
);
it("cuts 15 columns at heading 0", () =>
  expect(bladeColumns({ x: 0.5, y: 64, z: 0.5 }, 0, rule, RUN)).toEqual(
    Array.from({ length: 5 }, (_, i) => [-2 + i]).flatMap(([x]) =>
      [1, 2, 3].map((z) => ({ x, z, bottom: 64, minHeight: 3 })),
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
    for (const c of bladeColumns({ x: 0, y: y ?? 0, z: 0 }, 0, rule, RUN))
      expect(c.bottom).toBe(bottom);
});
it("never cuts the row of the block the feet stand on", () =>
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      // The floor block's top is within 0.01 of the feet, or the feet are inside its row.
      const floorRow =
        p.y - Math.floor(p.y) < 0.01 ? Math.floor(p.y) - 1 : Math.floor(p.y);
      for (const c of bladeColumns(p, y, rule, RUN))
        expect(c.bottom).toBeGreaterThan(floorRow);
    }),
  ));
it("starts a flight cut in the row the body sits in", () => {
  for (const y of [63.995, 64.5])
    for (const c of bladeColumns({ x: 0, y, z: 0 }, 0, rule, FLYING))
      expect(c.bottom).toBe(64);
});
it("clears the body height before continuing the ground run in the same columns as a fixed cut", () =>
  fc.assert(
    fc.property(
      pose,
      yaw,
      fc.constantFrom(rule, BULLDOZER_WIDE_BLADE),
      (p, y, blade) => {
        const run = bladeColumns(p, y, blade, { kind: "run" });
        const bottom = Math.ceil(p.y - 0.01);
        for (const c of run) {
          expect(c.minHeight).toBe(Math.ceil(p.y + blade.bodyHeight) - bottom);
          expect(c).not.toHaveProperty("height");
        }
        expect(
          run.map(({ x, z, bottom, minHeight }) => ({
            x,
            z,
            bottom,
            height: minHeight,
          })),
        ).toEqual(bladeColumns(p, y, blade, { kind: "fixed", grounded: true }));
      },
    ),
  ));
it("cuts up to the top of the body in flight", () => {
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      // Adding 0 turns the -0 that Math.ceil returns just below zero into +0.
      for (const c of bladeColumns(p, y, rule, FLYING))
        expect(c.bottom + (c.height ?? 0)).toBe(Math.ceil(p.y + 2.9) + 0);
    }),
  );
  for (const [y, h] of [
    [64, 3],
    [64.5, 4],
  ])
    for (const c of bladeColumns({ x: 0, y: y ?? 0, z: 0 }, 0, rule, FLYING))
      expect(c.height).toBe(h);
});
it("keeps rectangle cells and order with the blade bottom and height", () =>
  fc.assert(
    fc.property(pose, yaw, reach, (p, y, r) => {
      const bottom =
        r.kind === "run" || r.grounded
          ? Math.ceil(p.y - 0.01)
          : Math.floor(p.y + 0.01);
      const height = Math.ceil(p.y + rule.bodyHeight) - bottom;
      expect(bladeColumns(p, y, rule, r)).toEqual(
        rectCells(p, y, rule).map((cell) => ({
          ...cell,
          bottom,
          ...(r.kind === "run" ? { minHeight: height } : { height }),
        })),
      );
    }),
  ));

it("cuts 11 columns times 3 rows with the wide blade at heading 0", () => {
  expect(
    bladeColumns({ x: 0.5, y: 64, z: 0.5 }, 0, BULLDOZER_WIDE_BLADE, RUN),
  ).toEqual(
    Array.from({ length: 11 }, (_, i) => i - 5).flatMap((x) =>
      [1, 2, 3].map((z) => ({ x, z, bottom: 64, minHeight: 3 })),
    ),
  );
});
it("includes every normal column in the wide cut at any pose", () => {
  fc.assert(
    fc.property(pose, yaw, reach, (p, y, r) => {
      expect(bladeColumns(p, y, BULLDOZER_WIDE_BLADE, r)).toEqual(
        expect.arrayContaining(bladeColumns(p, y, rule, r)),
      );
    }),
  );
});
