import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { Box } from "../box";
import { roofGeometry } from "../roof/geometry";
import { cubeGeometry } from "./cube";
import { cylinderGeometry } from "./cylinder";
import type { FillStyle, HeightedKind } from "./kind";

export interface HeightedSpec {
  readonly base: Box;
  readonly kind: HeightedKind;
  readonly height: number;
}

export interface HeightedGeometry {
  cells(spec: HeightedSpec, fill: FillStyle): Iterable<Cell>;
  count(spec: HeightedSpec, fill: FillStyle): number;
  maxHeight(base: Box, worldTopY: number): number;
  wireframe(spec: HeightedSpec, maxPoints: number): Vec3[];
}

const GEOMETRIES: Record<HeightedKind, HeightedGeometry> = {
  gable: roofGeometry,
  hip: roofGeometry,
  cube: cubeGeometry,
  cylinder: cylinderGeometry,
};

export function geometryOf(kind: HeightedKind): HeightedGeometry {
  return GEOMETRIES[kind];
}
