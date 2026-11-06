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
])("offers the fill styles of %s", (kind, styles) => {
  expect(fillStylesFor(kind)).toEqual(styles);
});

it.each<[HeightStepKind, boolean]>([
  ["gable", false],
  ["hip", false],
  ["cylinder", true],
  ["cube", false],
  ["copy", false],
  ["cut", false],
])("reports whether %s locks a box height", (kind, locked) => {
  expect(locksBoxHeight(kind)).toBe(locked);
});

it("treats every solid kind as a heighted kind", () => {
  const solids: SolidKind[] = ["cylinder", "cube"];
  for (const solid of solids) {
    const kind: HeightedKind = solid;
    expect(fillStylesFor(kind)).toContain("tube");
  }
});
