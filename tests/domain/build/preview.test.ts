import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, type CellBox } from "../../../src/domain/build/box";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import {
  type BuildFlow,
  chooseHeighted,
} from "../../../src/domain/build/flow/flow";
import { previewPoints } from "../../../src/domain/build/preview/preview";
import { roofCells } from "../../../src/domain/build/roof/roof";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
import { asDimensionId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";

const coordinate = fc.integer({ min: -10000, max: 10000 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimensionId = asDimensionId("minecraft:overworld");
const material = blockStateOf("minecraft:stone");

function onEdge(box: CellBox, point: Vec3) {
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
      (a, b, blink, height, heightedKind) => {
        const box = boxOf(a, b);
        const flows: BuildFlow[] = [
          { kind: "idle" },
          { kind: "point1", cell: a, dimensionId, material },
          { kind: "endpoint", from: a, to: b, dimensionId, material },
          {
            kind: "heightStep",
            heightLocked: false,
            from: a,
            base: boxOf(a, { ...b, y: a.y }),
            heightedKind,
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
            height: height,
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
    kind: "heightStep" as const,
    heightLocked: false,
    from: base.min,
    base,
    previous: 5,
    dimensionId,
    material,
  };
  const gable = previewPoints(
    { ...flow, heightedKind: "gable" },
    { blink: false },
  ).roof;
  expect(gable).toContainEqual({ x: 0.5, y: 14.5, z: 2.5 });
  expect(gable).toContainEqual({ x: 8.5, y: 14.5, z: 2.5 });
  const hip = previewPoints(
    { ...flow, heightedKind: "hip" },
    { blink: false, height: 7 },
  ).roof;
  expect(hip).toContainEqual({ x: 2.5, y: 16.5, z: 2.5 });
  expect(hip).toContainEqual({ x: 6.5, y: 16.5, z: 2.5 });
  for (const point of [
    { x: 0.5, y: 10.5, z: 0.5 },
    { x: 8.5, y: 10.5, z: 4.5 },
  ])
    expect(hip).toContainEqual(point);
  const square = previewPoints(
    {
      ...flow,
      base: boxOf(base.min, { x: 4, y: 10, z: 4 }),
      heightedKind: "hip",
    },
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
      (origin, width, depth, height, heightedKind) => {
        const base = boxOf(origin, {
          x: origin.x + width - 1,
          y: origin.y,
          z: origin.z + depth - 1,
        });
        const points = previewPoints(
          {
            kind: "heightStep",
            heightLocked: false,
            from: origin,
            base,
            heightedKind,
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
          ...roofCells({ base, kind: heightedKind, height }, false),
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

it("draws a locked cylinder at the box height even when another height is aimed", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 30 }),
      fc.integer({ min: 1, max: 100 }),
      (height, aimed) => {
        const flow = chooseHeighted(
          {
            kind: "endpoint",
            dimensionId,
            material,
            from: { x: 0, y: 10, z: 0 },
            to: { x: 4, y: 10 + height - 1, z: 5 },
          },
          "cylinder",
        );
        if (flow.kind !== "heightStep") throw new Error("Expected height step");
        const expected = volumeOf("cylinder").wireframe(
          { base: flow.base, kind: "cylinder", height },
          BUILD_SPEC.outlineMaxPoints,
        );
        expect(expected.length).toBeGreaterThan(0);
        expect(previewPoints(flow, { blink: false }).roof).toEqual(expected);
        expect(
          previewPoints(flow, { blink: false, height: aimed }).roof,
        ).toEqual(expected);
      },
    ),
  );
});

it("uses only the Copy layer and warns exactly above the copy volume limit", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 128 }),
      fc.integer({ min: 2, max: 128 }),
      fc.integer({ min: 1, max: 256 }),
      fc.option(fc.integer({ min: 1, max: 256 }), { nil: undefined }),
      fc.boolean(),
      (width, depth, previous, aimed, heightLocked) => {
        const base = boxOf(
          { x: 0, y: 0, z: 0 },
          { x: width - 1, y: 0, z: depth - 1 },
        );
        const flow: BuildFlow = {
          kind: "heightStep",
          heightedKind: "copy",
          base,
          from: base.min,
          previous,
          heightLocked,
          dimensionId,
          material,
        };
        const set = previewPoints(flow, {
          blink: false,
          ...(aimed === undefined ? {} : { height: aimed }),
        });
        const height = heightLocked ? previous : (aimed ?? previous);
        const over = width * depth * height > BUILD_SPEC.maxCopyVolume;
        expect(set.copyOver.length > 0).toBe(over);
        expect(set.copy.length > 0).toBe(!over);
        expect(set.roof).toEqual([]);
        expect(set.shape).toEqual([]);
        expect(set.marker).toEqual([]);
        expect(set.endCube).toEqual([]);
        expect(set.paste).toEqual([]);
        const points = over ? set.copyOver : set.copy;
        expect(points).toEqual(
          volumeOf("copy").wireframe(
            { base, kind: "copy", height },
            BUILD_SPEC.outlineMaxPoints,
          ),
        );
      },
    ),
  );
});
