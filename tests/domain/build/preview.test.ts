import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { type Box, boxOf } from "../../../src/domain/build/box";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import type { BuildFlow } from "../../../src/domain/build/flow/flow";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import { roofCells } from "../../../src/domain/build/roof/roof";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";

const coordinate = fc.integer({ min: -10000, max: 10000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimensionId = asDimensionId("minecraft:overworld");
const material = blockStateOf("minecraft:stone");

function onEdge(box: Box, point: Vec3) {
  const axes = ["x", "y", "z"] as const;
  expect(
    axes.every(
      (axis) =>
        point[axis] >= box.min[axis] + 0.5 &&
        point[axis] <= box.max[axis] + 0.5,
    ),
  ).toBe(true);
  expect(
    axes.filter(
      (axis) =>
        point[axis] === box.min[axis] + 0.5 ||
        point[axis] === box.max[axis] + 0.5,
    ).length,
  ).toBeGreaterThanOrEqual(2);
}

it("bounds every list and keeps shape and paste samples on box edges", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.boolean(),
      fc.integer({ min: 1, max: 300 }),
      fc.constantFrom("gable" as const, "hip" as const),
      (a, b, blink, height, roofKind) => {
        const box = boxOf(a, b);
        const flows: BuildFlow[] = [
          { kind: "idle" },
          { kind: "point1", cell: a, dimensionId, material },
          { kind: "endpoint", from: a, to: b, dimensionId, material },
          {
            kind: "roofHeight",
            base: boxOf(a, { ...b, y: a.y }),
            roofKind,
            previous: height,
            dimensionId,
            material,
          },
          { kind: "pasteAim", skipAir: true },
        ];
        for (const flow of flows) {
          const set = previewPoints(flow, {
            blink,
            end: b,
            pasteBox: box,
            roofHeight: height,
          });
          for (const points of Object.values(set))
            expect(points.length).toBeLessThanOrEqual(
              BUILD_SPEC.outlineMaxPoints,
            );
          for (const point of [...set.shape, ...set.paste]) onEdge(box, point);
          if (flow.kind === "point1" || flow.kind === "endpoint")
            expect(set.endCube).toEqual(cornerMarkerPoints(b));
        }
      },
    ),
  );
});

it("alternates the first-point marker with blink and removes it at the endpoint step", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const flow = { kind: "point1" as const, cell: a, dimensionId, material };
      expect(previewPoints(flow, { blink: true }).marker).toEqual(
        cornerMarkerPoints(a),
      );
      expect(previewPoints(flow, { blink: false }).marker).toEqual([]);
      expect(
        previewPoints(
          { kind: "endpoint", from: a, to: b, dimensionId, material },
          { blink: true },
        ).marker,
      ).toEqual([]);
    }),
  );
});

it("leaves idle and unaimed paste empty", () => {
  for (const flow of [
    { kind: "idle" } as const,
    { kind: "pasteAim", skipAir: false } as const,
  ]) {
    expect(
      Object.values(previewPoints(flow, { blink: true })).every(
        (points) => points.length === 0,
      ),
    ).toBe(true);
  }
});

it("draws gable ridges on the long axis and hip ridges inset at both ends", () => {
  const base = boxOf({ x: 0, y: 10, z: 0 }, { x: 8, y: 10, z: 4 });
  const flow = {
    kind: "roofHeight" as const,
    base,
    previous: 5,
    dimensionId,
    material,
  };
  const gable = previewPoints(
    { ...flow, roofKind: "gable" },
    { blink: false },
  ).roof;
  expect(gable).toContainEqual({ x: 0.5, y: 14.5, z: 2.5 });
  expect(gable).toContainEqual({ x: 8.5, y: 14.5, z: 2.5 });
  const hip = previewPoints(
    { ...flow, roofKind: "hip" },
    { blink: false, roofHeight: 7 },
  ).roof;
  expect(hip).toContainEqual({ x: 2.5, y: 16.5, z: 2.5 });
  expect(hip).toContainEqual({ x: 6.5, y: 16.5, z: 2.5 });
  for (const point of [
    { x: 0.5, y: 10.5, z: 0.5 },
    { x: 8.5, y: 10.5, z: 4.5 },
  ])
    expect(hip).toContainEqual(point);
  const square = previewPoints(
    { ...flow, base: boxOf(base.min, { x: 4, y: 10, z: 4 }), roofKind: "hip" },
    { blink: false },
  ).roof;
  expect(
    square.filter((p) => p.y === 14.5).every((p) => p.x === 2.5 && p.z === 2.5),
  ).toBe(true);
});

it("keeps roof wireframes within the built footprint and centers the ridge on its top layer", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 2, max: 12 }),
      fc.integer({ min: 2, max: 12 }),
      fc.integer({ min: 2, max: 12 }),
      fc.constantFrom("gable" as const, "hip" as const),
      (origin, width, depth, height, roofKind) => {
        const base = boxOf(origin, {
          x: origin.x + width - 1,
          y: origin.y,
          z: origin.z + depth - 1,
        });
        const points = previewPoints(
          {
            kind: "roofHeight",
            base,
            roofKind,
            previous: height,
            dimensionId,
            material,
          },
          { blink: true },
        ).roof;
        expect(points.length).toBeGreaterThan(0);
        for (const p of points) {
          expect(p.x).toBeGreaterThanOrEqual(base.min.x + 0.5);
          expect(p.x).toBeLessThanOrEqual(base.max.x + 0.5);
          expect(p.z).toBeGreaterThanOrEqual(base.min.z + 0.5);
          expect(p.z).toBeLessThanOrEqual(base.max.z + 0.5);
          expect(p.y).toBeGreaterThanOrEqual(origin.y + 0.5);
          expect(p.y).toBeLessThanOrEqual(origin.y + height - 0.5);
        }
        const top = [
          ...roofCells({ base, kind: roofKind, height }, false),
        ].filter((c) => c.y === origin.y + height - 1);
        const ridge = points.filter((p) => p.y === origin.y + height - 0.5);
        const minX = Math.min(...top.map((c) => c.x)) + 0.5;
        const maxX = Math.max(...top.map((c) => c.x)) + 0.5;
        const minZ = Math.min(...top.map((c) => c.z)) + 0.5;
        const maxZ = Math.max(...top.map((c) => c.z)) + 0.5;
        for (const p of ridge) {
          expect(p.x).toBeGreaterThanOrEqual(minX);
          expect(p.x).toBeLessThanOrEqual(maxX);
          expect(p.z).toBeGreaterThanOrEqual(minZ);
          expect(p.z).toBeLessThanOrEqual(maxZ);
        }
        expect(
          (Math.min(...ridge.map((p) => p.x)) +
            Math.max(...ridge.map((p) => p.x))) /
            2,
        ).toBeCloseTo((minX + maxX) / 2);
        expect(
          (Math.min(...ridge.map((p) => p.z)) +
            Math.max(...ridge.map((p) => p.z))) /
            2,
        ).toBeCloseTo((minZ + maxZ) / 2);
      },
    ),
  );
});
