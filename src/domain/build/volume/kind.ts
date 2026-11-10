import { type CellBox, volume } from "../box";
import type { RoofKind } from "../roof/roof";
import { planRotationAboutCenter } from "../rotation/rotateBox";
import { BUILD_SPEC } from "../spec";

export type SolidKind =
  | "cylinder"
  | "cube"
  | "sideCylinderX"
  | "sideCylinderZ"
  | "sphere";
export type HeightedKind = RoofKind | SolidKind;
export type BoxStepKind = "copy" | "cut" | "rotate";
export type HeightStepKind = HeightedKind | BoxStepKind;

const BOX_STEP_LIMITS: Readonly<Record<BoxStepKind, number>> = {
  copy: BUILD_SPEC.maxCopyVolume,
  cut: BUILD_SPEC.maxCopyVolume,
  rotate: BUILD_SPEC.maxCopyVolume,
};

export function isBoxStepKind(kind: HeightStepKind): kind is BoxStepKind {
  return Object.hasOwn(BOX_STEP_LIMITS, kind);
}

export function boxStepLimit(kind: BoxStepKind): number {
  return BOX_STEP_LIMITS[kind];
}

// Rotation is refused on the union of the old and new boxes, which is larger
// than the box itself for a non-square footprint, so the preview must measure
// the same volume the use case checks.
export function boxStepVolume(kind: BoxStepKind, box: CellBox): number {
  return volume(kind === "rotate" ? planRotationAboutCenter(box).union : box);
}

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
  cube: { fills: SOLID_FILLS, locksBoxHeight: false },
  sphere: { fills: CLOSED_FILLS, locksBoxHeight: true },
};

export function fillStylesFor(kind: HeightedKind): readonly FillStyle[] {
  return HEIGHTED_TRAITS[kind].fills;
}

export function locksBoxHeight(kind: HeightStepKind): boolean {
  return !isBoxStepKind(kind) && HEIGHTED_TRAITS[kind].locksBoxHeight;
}
