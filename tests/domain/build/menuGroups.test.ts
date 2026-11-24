import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BuildMenuEntryId,
  buildEntries,
  type RootEntryId,
  type ShapeChoice,
  shapeChoiceOf,
} from "../../../src/domain/build/flow/menu";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { cellOf } from "../../../src/domain/shared/cells";

const coord = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const offset = fc.integer({ min: 1, max: 100 });
const axes = ["x", "y", "z"] as const;
const choices = {
  stairs: { kind: "stairs", op: "stairs" },
  terrace: { kind: "stairs", op: "terrace" },
  adjustHeight: { kind: "adjustHeight" },
  buildShape: { kind: "openBuild" },
  back: { kind: "closeBuild" },
  cancel: { kind: "cancel" },
  cut: { kind: "edit", id: "cut" },
  removeAbove: { kind: "edit", id: "removeAbove" },
  fillBelow: { kind: "edit", id: "fillBelow" },
  copy: { kind: "edit", id: "copy" },
  place: { kind: "build", id: "place" },
  fill: { kind: "build", id: "fill" },
  frame: { kind: "build", id: "frame" },
  faces: { kind: "build", id: "faces" },
  walls: { kind: "build", id: "walls" },
  gable: { kind: "build", id: "gable" },
  hip: { kind: "build", id: "hip" },
  cylinder: { kind: "build", id: "cylinder" },
  sideCylinder: { kind: "build", id: "sideCylinder" },
  sphere: { kind: "build", id: "sphere" },
  cube: { kind: "build", id: "cube" },
} satisfies Record<RootEntryId | BuildMenuEntryId, ShapeChoice>;

describe("menu entry groups", () => {
  it.each(Object.keys(choices) as (keyof typeof choices)[])(
    "maps %s to its shape-menu choice",
    (id) => {
      expect(shapeChoiceOf(id)).toEqual(choices[id]);
    },
  );

  it("offers Place for lines along every axis in either direction", () => {
    fc.assert(
      fc.property(cell, offset, fc.boolean(), (from, distance, reverse) => {
        for (const axis of axes) {
          const to = cellOf({
            ...from,
            [axis]: from[axis] + (reverse ? -distance : distance),
          });
          expect(buildEntries(shapeOf(cellOf(from), to))).toEqual([
            { id: "place" },
          ]);
        }
      }),
    );
  });

  it("offers only Fill and Frame for vertical rectangles", () => {
    fc.assert(
      fc.property(cell, offset, offset, (from, height, width) => {
        for (const axis of ["x", "z"] as const) {
          const to = cellOf({
            ...from,
            y: from.y + height,
            [axis]: from[axis] - width,
          });
          expect(buildEntries(shapeOf(cellOf(from), to))).toEqual([
            { id: "fill" },
            { id: "frame" },
          ]);
        }
      }),
    );
  });

  it("adds roofs and solids after horizontal rectangle styles", () => {
    fc.assert(
      fc.property(cell, offset, offset, (from, width, depth) => {
        const to = cellOf({ ...from, x: from.x - width, z: from.z + depth });
        expect(buildEntries(shapeOf(cellOf(from), to))).toEqual(
          [
            "fill",
            "frame",
            "gable",
            "hip",
            "cylinder",
            "sideCylinder",
            "sphere",
            "cube",
          ].map((id) => ({ id })),
        );
      }),
    );
  });

  it("adds roofs and solids after box styles", () => {
    fc.assert(
      fc.property(
        cell,
        offset,
        offset,
        offset,
        (from, width, height, depth) => {
          const to = cellOf({
            x: from.x + width,
            y: from.y - height,
            z: from.z + depth,
          });
          expect(buildEntries(shapeOf(cellOf(from), to))).toEqual(
            [
              "fill",
              "faces",
              "walls",
              "gable",
              "hip",
              "cylinder",
              "sideCylinder",
              "sphere",
              "cube",
            ].map((id) => ({ id })),
          );
        },
      ),
    );
  });
});
