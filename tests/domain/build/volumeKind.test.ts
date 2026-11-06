import { expect, it } from "vitest";
import {
  fillStylesFor,
  type HeightedKind,
  type HeightStepKind,
  locksBoxHeight,
  type SolidKind,
} from "../../../src/domain/build/volume/kind";

it.each<[HeightedKind, string[]]>([
  ["gable", ["fill", "hollow"]],
  ["hip", ["fill", "hollow"]],
  ["cylinder", ["fill", "hollow", "tube"]],
  ["cube", ["fill", "hollow", "tube"]],
  ["sideCylinderX", ["fill", "hollow", "tube"]],
  ["sideCylinderZ", ["fill", "hollow", "tube"]],
  ["sphere", ["fill", "hollow"]],
])("offers the fill styles of %s", (kind, styles) => {
  expect(fillStylesFor(kind)).toEqual(styles);
});

it.each<[HeightStepKind, boolean]>([
  ["gable", false],
  ["hip", false],
  ["cylinder", true],
  ["sideCylinderX", true],
  ["sideCylinderZ", true],
  ["cube", false],
  ["sphere", true],
  ["copy", false],
  ["cut", false],
])("reports whether %s locks a box height", (kind, locked) => {
  expect(locksBoxHeight(kind)).toBe(locked);
});

it("treats every solid kind as a heighted kind that can be filled", () => {
  const solids: SolidKind[] = [
    "cylinder",
    "cube",
    "sideCylinderX",
    "sideCylinderZ",
    "sphere",
  ];
  for (const solid of solids) {
    const kind: HeightedKind = solid;
    expect(fillStylesFor(kind)).toContain("fill");
  }
});
