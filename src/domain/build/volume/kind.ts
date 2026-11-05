import type { RoofKind } from "../roof/roof";
import { BUILD_SPEC } from "../spec";

export type SolidKind = "cylinder" | "cube";
export type HeightedKind = RoofKind | SolidKind;
export type BoxStepKind = "copy" | "cut";
export type HeightStepKind = HeightedKind | BoxStepKind;

const BOX_STEP_LIMITS: Readonly<Record<BoxStepKind, number>> = {
  copy: BUILD_SPEC.maxCopyVolume,
  cut: BUILD_SPEC.maxVolume,
};

export function isBoxStepKind(kind: HeightStepKind): kind is BoxStepKind {
  return Object.hasOwn(BOX_STEP_LIMITS, kind);
}

export function boxStepLimit(kind: BoxStepKind): number {
  return BOX_STEP_LIMITS[kind];
}

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
