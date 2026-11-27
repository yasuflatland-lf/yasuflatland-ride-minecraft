import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, type CellBox, edgePoints } from "../../../src/domain/build/box";
import { cornerMarkerEdges } from "../../../src/domain/build/cornerMarker";
import type { BuildFlow } from "../../../src/domain/build/flow/state";
import {
  boxOutline,
  endpointMarkers,
  previewModel,
} from "../../../src/domain/build/preview/preview";
import { roofCells } from "../../../src/domain/build/roof/roof";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
import { cellOf, sameCell } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import {
  chooseHeightedFlow,
  tappedSelection,
} from "../../support/buildSelection";

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
      fc.string({ minLength: 1 }),
      fc.integer({ min: 1, max: 300 }),
      fc.constantFrom("gable" as const, "hip" as const),
      (a, b, blink, viewer, height, heightedKind) => {
        const playerDimension = asDimensionId(`test:${viewer}`);
        const box = boxOf(cellOf(a), cellOf(b));
        const flows: BuildFlow[] = [
          { kind: "idle" },
          { kind: "point1", start: { dimensionId, cell: cellOf(a), material } },
          {
            kind: "selected",
            menuLevel: "root",
            ...tappedSelection(
              selectionOf(dimensionId, boxOf(cellOf(a), cellOf(b)), material),
              cellOf(a),
              cellOf(b),
            ),
          },
          {
            kind: "heightStep",
            heightLocked: false,
            base: boxOf(cellOf(a), cellOf({ ...b, y: a.y })),
            heightedKind,
            liveHeight: height,
            start: { dimensionId, cell: cellOf(a), material },
            taps: { from: cellOf(a), to: cellOf(b) },
          },
          { kind: "pasteAim", manualTurn: 0 },
        ];
        for (const flow of flows) {
          const model = previewModel(flow, {
            blink,
            playerDimension,
            end: flow.kind === "selected" ? cellOf(a) : cellOf(b),
            pasteTarget: { box, corner: box.min },
            height: height,
          });
          const { set } = model;
          expect(model.dimensionId).toBe(
            flow.kind === "idle" || flow.kind === "pasteAim"
              ? playerDimension
              : dimensionId,
          );
          for (const points of Object.values(set))
            expect(points.length).toBeLessThanOrEqual(
              BUILD_SPEC.outlineMaxPoints,
            );
          for (const point of [
            ...set.shape,
            ...set.paste,
            ...set.pasteVertical,
          ])
            onEdge(box, point);
          expect(
            set.paste.length + set.pasteVertical.length,
          ).toBeLessThanOrEqual(BUILD_SPEC.outlineMaxPoints);
          if (flow.kind === "pasteAim")
            expect(set.startMarker).toEqual(cornerMarkerEdges(box.min));
          if (flow.kind === "point1" || flow.kind === "selected")
            expect(set).toMatchObject(
              endpointMarkers(cellOf(a), cellOf(b), blink),
            );
        }
      },
    ),
  );
});

it("draws the terrain confirmation at the confirmed selection height", () => {
  const from = cellOf({ x: 0, y: 60, z: 0 });
  const to = cellOf({ x: 3, y: 62, z: 3 });
  const selection = selectionOf(
    dimensionId,
    boxOf(from, cellOf({ ...to, y: 68 })),
    material,
  );
  const common = tappedSelection(selection, from, to);
  expect(
    previewModel(
      { ...common, kind: "terrainConfirm", op: "removeAbove" },
      { blink: true },
    ).set,
  ).toEqual(
    previewModel(
      {
        kind: "selected",
        menuLevel: "root",
        ...tappedSelection(selection, from, to),
      },
      { blink: true },
    ).set,
  );
});

it("blinks the start marker while the end is undefined", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (start, blink) => {
      const markers = endpointMarkers(cellOf(start), undefined, blink);
      expect(markers).toEqual({
        startMarker: blink ? cornerMarkerEdges(cellOf(start)) : [],
        endMarker: [],
        sharedMarker: [],
      });
      expect(
        previewModel(
          {
            kind: "point1",
            start: { dimensionId, cell: cellOf(start), material },
          },
          { blink },
        ).set,
      ).toMatchObject(markers);
    }),
  );
});

it("draws one shared marker on every redraw for coincident endpoints", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (start, blink) => {
      expect(
        endpointMarkers(cellOf(start), cellOf({ ...start }), blink),
      ).toEqual({
        startMarker: [],
        endMarker: [],
        sharedMarker: cornerMarkerEdges(cellOf(start)),
      });
    }),
  );
});

it("draws both distinct endpoint markers on every redraw", () => {
  fc.assert(
    fc.property(cell, cell, fc.boolean(), (start, end, blink) => {
      fc.pre(!sameCell(cellOf(start), cellOf(end)));
      expect(endpointMarkers(cellOf(start), cellOf(end), blink)).toEqual({
        startMarker: cornerMarkerEdges(cellOf(start)),
        endMarker: cornerMarkerEdges(cellOf(end)),
        sharedMarker: [],
      });
    }),
  );
});

it("leaves idle and unaimed paste empty", () => {
  for (const flow of [
    { kind: "idle" } as const,
    { kind: "pasteAim", manualTurn: 0 } as const,
  ]) {
    expect(
      Object.values(previewModel(flow, { blink: true }).set).every(
        (points) => points.length === 0,
      ),
    ).toBe(true);
  }
});

it("draws gable ridges on the long axis and hip ridges inset at both ends", () => {
  const base = boxOf(
    cellOf({ x: 0, y: 10, z: 0 }),
    cellOf({ x: 8, y: 10, z: 4 }),
  );
  const flow = {
    kind: "heightStep" as const,
    heightLocked: false,
    base,
    liveHeight: 5,
    start: { dimensionId, cell: base.min, material },
    taps: { from: base.min, to: base.max },
  };
  const gable = previewModel(
    { ...flow, heightedKind: "gable" },
    { blink: false },
  ).set.roof;
  expect(gable).toContainEqual({ x: 0.5, y: 14.5, z: 2.5 });
  expect(gable).toContainEqual({ x: 8.5, y: 14.5, z: 2.5 });
  const hip = previewModel(
    { ...flow, heightedKind: "hip" },
    { blink: false, height: 7 },
  ).set.roof;
  expect(hip).toContainEqual({ x: 2.5, y: 16.5, z: 2.5 });
  expect(hip).toContainEqual({ x: 6.5, y: 16.5, z: 2.5 });
  for (const point of [
    { x: 0.5, y: 10.5, z: 0.5 },
    { x: 8.5, y: 10.5, z: 4.5 },
  ])
    expect(hip).toContainEqual(point);
  const square = previewModel(
    {
      ...flow,
      base: boxOf(base.min, cellOf({ x: 4, y: 10, z: 4 })),
      heightedKind: "hip",
    },
    { blink: false },
  ).set.roof;
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
        const base = boxOf(
          cellOf(origin),
          cellOf({
            x: origin.x + width - 1,
            y: origin.y,
            z: origin.z + depth - 1,
          }),
        );
        const points = previewModel(
          {
            kind: "heightStep",
            heightLocked: false,
            base,
            heightedKind,
            liveHeight: height,
            start: { dimensionId, cell: cellOf(origin), material },
            taps: { from: cellOf(origin), to: base.max },
          },
          { blink: true },
        ).set.roof;
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
          ...roofCells(
            { base, kind: heightedKind, height, style: "stepped" },
            false,
          ),
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

it.each([
  ["gable", { x: 2.5, y: 12.5, z: 0.5 }],
  ["hip", { x: 2.5, y: 12.5, z: 2.5 }],
] as const)(
  "draws a locked stair %s wireframe at its fixed pitch",
  (kind, ridge) => {
    const box = boxOf(
      cellOf({ x: 0, y: 10, z: 0 }),
      cellOf({ x: 4, y: 15, z: 6 }),
    );
    const flow = chooseHeightedFlow(
      {
        kind: "selected",
        menuLevel: "build",
        ...tappedSelection(
          selectionOf(
            dimensionId,
            box,
            blockStateOf("minecraft:oak_stairs", {
              weirdo_direction: 0,
              upside_down_bit: false,
            }),
          ),
          box.min,
          box.max,
        ),
      },
      kind,
    );
    const { roof } = previewModel(flow, { blink: false, height: 8 }).set;
    expect(roof).toContainEqual(ridge);
    expect(roof).toContainEqual({ x: 0.5, y: 10.5, z: 0.5 });
    expect(Math.max(...roof.map((point) => point.y))).toBe(ridge.y);
  },
);

it("draws a locked cylinder at the box height even when another height is aimed", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 30 }),
      fc.integer({ min: 1, max: 100 }),
      (height, aimed) => {
        const flow = chooseHeightedFlow(
          {
            kind: "selected",
            menuLevel: "root",
            ...tappedSelection(
              selectionOf(
                dimensionId,
                boxOf(
                  cellOf({ x: 0, y: 10, z: 0 }),
                  cellOf({ x: 4, y: 10 + height - 1, z: 5 }),
                ),
                material,
              ),
              cellOf({ x: 0, y: 10, z: 0 }),
              cellOf({ x: 4, y: 10 + height - 1, z: 5 }),
            ),
          },
          "cylinder",
        );
        if (flow.kind !== "heightStep") throw new Error("Expected height step");
        const expected = volumeOf("cylinder").wireframe(
          { base: flow.base, kind: "cylinder", height },
          BUILD_SPEC.outlineMaxPoints,
        );
        expect(expected.length).toBeGreaterThan(0);
        expect(previewModel(flow, { blink: false }).set.roof).toEqual(expected);
        expect(
          previewModel(flow, { blink: false, height: aimed }).set.roof,
        ).toEqual(expected);
      },
    ),
  );
});

it("boxOutline adds extra points on horizontal edges only and stays within the budget", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 0, max: 40 }),
      (dx, dy, dz) => {
        const box = boxOf(
          cellOf({ x: 0, y: 0, z: 0 }),
          cellOf({ x: dx, y: dy, z: dz }),
        );
        const points = boxOutline(box);
        expect(points.length).toBeLessThanOrEqual(BUILD_SPEC.outlineMaxPoints);
        for (const p of points) {
          // Extra points stay at block-center height and on the center line
          // of one horizontal axis, so they lie on a horizontal edge.
          expect(Number.isInteger(p.y - 0.5)).toBe(true);
          expect(
            Number.isInteger(p.x - 0.5) || Number.isInteger(p.z - 0.5),
          ).toBe(true);
        }
        const cells = edgePoints(box, BUILD_SPEC.outlineMaxPoints);
        if (cells.length === 1 || dx + dz === 0) return;
        if (points.length <= BUILD_SPEC.outlineMaxPoints)
          expect(points.length).toBeGreaterThanOrEqual(cells.length);
      },
    ),
  );
});
