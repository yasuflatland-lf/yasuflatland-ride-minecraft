import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { Box } from "../box";
import { roofPlacement, roofVolume } from "../roof/geometry";
import { cubePlacement, cubeVolume } from "./cube";
import { cylinderPlacement, cylinderVolume } from "./cylinder";
import type { FillStyle, HeightedKind } from "./kind";

export interface HeightedSpec {
  readonly base: Box;
  readonly kind: HeightedKind;
  readonly height: number;
}

export interface HeightedVolume {
  maxHeight(base: Box, worldTopY: number): number;
  wireframe(spec: HeightedSpec, maxPoints: number): Vec3[];
}

export interface HeightedPlacement {
  cells(spec: HeightedSpec, fill: FillStyle): Iterable<Cell>;
  count(spec: HeightedSpec, fill: FillStyle): number;
}

const VOLUMES: Record<HeightedKind, HeightedVolume> = {
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

export function volumeOf(kind: HeightedKind): HeightedVolume {
  return VOLUMES[kind];
}

export function placementOf(kind: HeightedKind): HeightedPlacement {
  return PLACEMENTS[kind];
}
