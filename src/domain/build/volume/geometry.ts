import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import type { Box } from "../box";
import { roofGeometry } from "../roof/geometry";
import type { RoofKind } from "../roof/roof";
import type { FillStyle, HeightedKind, SolidKind } from "./kind";

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

const GEOMETRIES: Record<RoofKind, HeightedGeometry> &
  Partial<Record<SolidKind, HeightedGeometry>> = {
  gable: roofGeometry,
  hip: roofGeometry,
};

export function geometryOf(kind: HeightedKind): HeightedGeometry {
  const geometry = GEOMETRIES[kind];
  if (!geometry) throw new Error(`No geometry registered for ${kind}`);
  return geometry;
}
