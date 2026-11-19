import type { Cell } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { boxWithHeight, type CellBox } from "../box";
import { roofPlacement, roofVolume } from "../roof/geometry";
import { isRoofKind } from "../roof/roof";
import { boxStepVolume } from "./boxStep";
import { cubePlacement, cubeVolume } from "./cube";
import { cylinderPlacement, cylinderVolume } from "./cylinder";
import type { FillStyle, HeightedKind, HeightStepKind } from "./kind";
import { sideCylinderPlacement, sideCylinderVolume } from "./sideCylinder";
import { spherePlacement, sphereVolume } from "./sphere";

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
  cut: boxStepVolume,
  rotate: boxStepVolume,
  gable: roofVolume,
  hip: roofVolume,
  cube: cubeVolume,
  cylinder: cylinderVolume,
  sideCylinderX: sideCylinderVolume("x"),
  sideCylinderZ: sideCylinderVolume("z"),
  sphere: sphereVolume,
};

const PLACEMENTS: Record<HeightedKind, HeightedPlacement> = {
  gable: roofPlacement,
  hip: roofPlacement,
  cube: cubePlacement,
  cylinder: cylinderPlacement,
  sideCylinderX: sideCylinderPlacement("x"),
  sideCylinderZ: sideCylinderPlacement("z"),
  sphere: spherePlacement,
};

export function volumeOf(kind: HeightStepKind): HeightedVolume {
  return VOLUMES[kind];
}

export function placementOf(kind: HeightedKind): HeightedPlacement {
  return PLACEMENTS[kind];
}

export function boundingBox(spec: HeightedSpec): CellBox {
  if (spec.height < 1)
    throw new Error("A heighted volume must contain at least one cell");
  // Roofs cover the entire base and keep at least one cell on the top layer.
  if (spec.kind === "cube" || isRoofKind(spec.kind))
    return boxWithHeight(spec.base, spec.height);

  const cells = placementOf(spec.kind).cells(spec, "fill")[Symbol.iterator]();
  const first = cells.next();
  if (first.done)
    throw new Error("A heighted volume must contain at least one cell");
  const min = { ...first.value };
  const max = { ...first.value };
  for (let next = cells.next(); !next.done; next = cells.next()) {
    const { x, y, z } = next.value;
    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  }
  return { min, max };
}
