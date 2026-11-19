import type { RoofKind } from "../roof/roof";

export type SolidKind =
  | "cylinder"
  | "cube"
  | "sideCylinderX"
  | "sideCylinderZ"
  | "sphere";
export type HeightedKind = RoofKind | SolidKind;
export type HeightStepKind = HeightedKind;

export type FillStyle = "fill" | "hollow" | "tube";

const CLOSED_FILLS: readonly FillStyle[] = Object.freeze(["fill", "hollow"]);
const SOLID_FILLS: readonly FillStyle[] = Object.freeze([
  "fill",
  "hollow",
  "tube",
]);

interface HeightedTraits {
  readonly fills: readonly FillStyle[];
  readonly locksBoxHeight: boolean;
}

const HEIGHTED_TRAITS: Readonly<Record<HeightedKind, HeightedTraits>> = {
  gable: { fills: CLOSED_FILLS, locksBoxHeight: false },
  hip: { fills: CLOSED_FILLS, locksBoxHeight: false },
  cylinder: { fills: SOLID_FILLS, locksBoxHeight: true },
  sideCylinderX: { fills: SOLID_FILLS, locksBoxHeight: true },
  sideCylinderZ: { fills: SOLID_FILLS, locksBoxHeight: true },
  cube: { fills: SOLID_FILLS, locksBoxHeight: true },
  sphere: { fills: CLOSED_FILLS, locksBoxHeight: true },
};

export function fillStylesFor(kind: HeightedKind): readonly FillStyle[] {
  return HEIGHTED_TRAITS[kind].fills;
}

export function locksBoxHeight(kind: HeightStepKind): boolean {
  return HEIGHTED_TRAITS[kind].locksBoxHeight;
}
