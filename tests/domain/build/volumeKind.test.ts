import { expect, it } from "vitest";
import {
  fillStylesFor,
  type HeightedKind,
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

it("treats every solid kind as a heighted kind", () => {
  const solids: SolidKind[] = ["cylinder", "cube"];
  for (const solid of solids) {
    const kind: HeightedKind = solid;
    expect(fillStylesFor(kind)).toContain("tube");
  }
});
