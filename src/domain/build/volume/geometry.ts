import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { CellBox } from "../box";
import { roofPlacement, roofVolume } from "../roof/geometry";
import { boxStepVolume } from "./boxStep";
import { cubePlacement, cubeVolume } from "./cube";
import { cylinderPlacement, cylinderVolume } from "./cylinder";
import type { FillStyle, HeightedKind, HeightStepKind } from "./kind";

export interface HeightStepSpec {
  readonly base: CellBox;
  readonly kind: HeightStepKind;
  readonly height: number;
}

export interface HeightedSpec extends HeightStepSpec {
  readonly kind: HeightedKind;
}

export interface HeightedVolume {
  maxHeight(base: CellBox, worldTopY: number): number;
  wireframe(spec: HeightStepSpec, maxPoints: number): Vec3[];
}

export interface HeightedPlacement {
  cells(spec: HeightedSpec, fill: FillStyle): Iterable<Cell>;
  count(spec: HeightedSpec, fill: FillStyle): number;
}

const VOLUMES: Record<HeightStepKind, HeightedVolume> = {
  copy: boxStepVolume,
  gable: roofVolume,
  hip: roofVolume,
  cube: cubeVolume,
  cylinder: cylinderVolume,
};

const PLACEMENTS: Record<HeightedKind, HeightedPlacement> = {
  gable: roofPlacement,
  hip: roofPlacement,
  cube: cubePlacement,
  cylinder: cylinderPlacement,
};

export function volumeOf(kind: HeightStepKind): HeightedVolume {
  return VOLUMES[kind];
}

export function placementOf(kind: HeightedKind): HeightedPlacement {
  return PLACEMENTS[kind];
}
