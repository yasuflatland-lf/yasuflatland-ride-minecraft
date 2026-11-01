import type { RoofKind } from "../roof/roof";

export type SolidKind = "cylinder" | "cube";
export type HeightedKind = RoofKind | SolidKind;
export type FillStyle = "fill" | "hollow" | "tube";

const ROOF_FILLS: readonly FillStyle[] = Object.freeze(["fill", "hollow"]);
const SOLID_FILLS: readonly FillStyle[] = Object.freeze([
  "fill",
  "hollow",
  "tube",
]);

export function fillStylesFor(kind: HeightedKind): readonly FillStyle[] {
  return kind === "cylinder" || kind === "cube" ? SOLID_FILLS : ROOF_FILLS;
}
