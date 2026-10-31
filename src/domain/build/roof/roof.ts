import type { Cell } from "../../shared/cells";
import type { Box } from "../box";

export type RoofKind = "gable" | "hip";

export interface RoofSpec {
  readonly base: Box;
  readonly kind: RoofKind;
  readonly height: number;
}

interface Rectangle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export function maxRoofHeight(base: Box, worldTopY?: number): number {
  const limit =
    3 * Math.max(base.max.x - base.min.x + 1, base.max.z - base.min.z + 1);
  return Math.max(
    1,
    Math.min(
      limit,
      worldTopY === undefined ? limit : worldTopY - base.min.y + 1,
    ),
  );
}

function layerAt(spec: RoofSpec, layer: number): Rectangle {
  const { base, kind, height } = spec;
  const sx = base.max.x - base.min.x + 1;
  const sz = base.max.z - base.min.z + 1;
  // An even square ends in a 2x2 apex: a single cell cannot preserve symmetry.
  const inset = Math.round(
    (height === 1 ? 0 : layer / (height - 1)) *
      Math.floor((Math.min(sx, sz) - 1) / 2),
  );
  const dx = kind === "hip" || sx < sz ? inset : 0;
  const dz = kind === "hip" || sx >= sz ? inset : 0;
  return {
    minX: base.min.x + dx,
    maxX: base.max.x - dx,
    minZ: base.min.z + dz,
    maxZ: base.max.z - dz,
  };
}

function interiorAt(
  spec: RoofSpec,
  layer: number,
  current: Rectangle,
): Rectangle | undefined {
  if (layer === 0 || layer === spec.height - 1) return undefined;
  const above = layerAt(spec, layer + 1);
  // Nested layers guarantee the neighbour below; only the sides and above constrain the interior.
  return {
    minX: Math.max(current.minX + 1, above.minX),
    maxX: Math.min(current.maxX - 1, above.maxX),
    minZ: Math.max(current.minZ + 1, above.minZ),
    maxZ: Math.min(current.maxZ - 1, above.maxZ),
  };
}

function area(rect: Rectangle): number {
  return (
    Math.max(0, rect.maxX - rect.minX + 1) *
    Math.max(0, rect.maxZ - rect.minZ + 1)
  );
}

export function* roofCells(spec: RoofSpec, hollow: boolean): Iterable<Cell> {
  for (let layer = 0; layer < spec.height; layer++) {
    const current = layerAt(spec, layer);
    const interior = hollow ? interiorAt(spec, layer, current) : undefined;
    for (let z = current.minZ; z <= current.maxZ; z++) {
      for (let x = current.minX; x <= current.maxX; x++) {
        if (
          interior &&
          x >= interior.minX &&
          x <= interior.maxX &&
          z >= interior.minZ &&
          z <= interior.maxZ
        )
          continue;
        yield { x, y: spec.base.min.y + layer, z };
      }
    }
  }
}

export function roofCount(spec: RoofSpec, hollow: boolean): number {
  let count = 0;
  for (let layer = 0; layer < spec.height; layer++) {
    const current = layerAt(spec, layer);
    const interior = hollow ? interiorAt(spec, layer, current) : undefined;
    count += area(current) - (interior ? area(interior) : 0);
  }
  return count;
}
