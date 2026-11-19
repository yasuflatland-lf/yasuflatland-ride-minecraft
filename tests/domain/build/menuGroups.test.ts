import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildEntries,
  editEntries,
  isBuildEntry,
  isEditEntry,
  type ShapeEntryId,
} from "../../../src/domain/build/flow/menu";
import { shapeOf } from "../../../src/domain/build/shape/shape";

const coord = fc.integer({ min: -1000, max: 1000 });
const cell = fc.record({ x: coord, y: coord, z: coord });
const offset = fc.integer({ min: 1, max: 100 });
const axes = ["x", "y", "z"] as const;
const editIds = ["cut", "removeAbove", "fillBelow", "copy"] as const;
const buildIds = [
  "place",
  "fill",
  "frame",
  "faces",
  "walls",
  "gable",
  "hip",
  "cylinder",
  "sideCylinder",
  "sphere",
  "cube",
] as const;
const entryId = fc.constantFrom<ShapeEntryId>(
  ...editIds,
  ...buildIds,
  "cancel",
);

describe("menu entry groups", () => {
  it("returns the edit entries in order", () => {
    expect(editEntries()).toEqual(editIds.map((id) => ({ id })));
  });

  it("offers Place for lines along every axis in either direction", () => {
    fc.assert(
      fc.property(cell, offset, fc.boolean(), (from, distance, reverse) => {
        for (const axis of axes) {
          const to = {
            ...from,
            [axis]: from[axis] + (reverse ? -distance : distance),
          };
          expect(buildEntries(shapeOf(from, to))).toEqual([{ id: "place" }]);
        }
      }),
    );
  });

  it("offers only Fill and Frame for vertical rectangles", () => {
    fc.assert(
      fc.property(cell, offset, offset, (from, height, width) => {
        for (const axis of ["x", "z"] as const) {
          const to = {
            ...from,
            y: from.y + height,
            [axis]: from[axis] - width,
          };
          expect(buildEntries(shapeOf(from, to))).toEqual([
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
        const to = { ...from, x: from.x - width, z: from.z + depth };
        expect(buildEntries(shapeOf(from, to))).toEqual(
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
          const to = {
            x: from.x + width,
            y: from.y - height,
            z: from.z + depth,
          };
          expect(buildEntries(shapeOf(from, to))).toEqual(
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

  it("classifies every entry into its group and excludes Cancel from both", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(
          [...editIds, ...buildIds, "cancel"] as ShapeEntryId[],
          {
            minLength: editIds.length + buildIds.length + 1,
          },
        ),
        (ids) => {
          for (const id of ids) {
            expect(isEditEntry(id)).toBe(editIds.some((edit) => edit === id));
            expect(isBuildEntry(id)).toBe(
              buildIds.some((build) => build === id),
            );
          }
        },
      ),
    );
  });

  it("keeps subsequent edit entries independent of returned entry mutations", () => {
    fc.assert(
      fc.property(entryId, (id) => {
        const entries = editEntries();
        entries.splice(0);
        expect(isEditEntry(id)).toBe(editIds.some((edit) => edit === id));
        expect(editEntries()).toEqual(editIds.map((entry) => ({ id: entry })));
      }),
    );
  });
});
