import type { Cell } from "../../shared/cells";
import { type CellBox, sizeOf } from "../box";
import type { Facing } from "../rotation/facing";

export type RoofKind = "gable" | "hip";
export type RoofStyle = "stepped" | "stair";
export type RoofSlope =
  | { readonly kind: "slope"; readonly descends: Facing }
  | { readonly kind: "ridge" };

export function isRoofKind(kind: string): kind is RoofKind {
  return kind === "gable" || kind === "hip";
}

export interface RoofSpec {
  readonly base: CellBox;
  readonly kind: RoofKind;
  readonly height: number;
  readonly style: RoofStyle;
}

interface Rectangle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export function maxRoofHeight(base: CellBox, worldTopY?: number): number {
  const size = sizeOf(base);
  const limit = 3 * Math.max(size.x, size.z);
  return Math.max(
    1,
    Math.min(
      limit,
      worldTopY === undefined ? limit : worldTopY - base.min.y + 1,
    ),
  );
}

function maxInset(sx: number, sz: number): number {
  return Math.floor((Math.min(sx, sz) - 1) / 2);
}

/** Height at which every layer steps in by exactly one cell: floor((min(sx, sz) - 1) / 2) + 1. */
export function stairRoofHeight(base: CellBox): number {
  const { x, z } = sizeOf(base);
  return maxInset(x, z) + 1;
}

function layerAt(spec: RoofSpec, layer: number): Rectangle {
  const { base, kind, height } = spec;
  const { x: sx, z: sz } = sizeOf(base);
  // An even square ends in a 2x2 apex: a single cell cannot preserve symmetry.
  const inset = Math.round(
    (height === 1 ? 0 : layer / (height - 1)) * maxInset(sx, sz),
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

/** Precondition: `cell` is one of roofCells(spec, false). */
export function roofSlopeAt(spec: RoofSpec, cell: Cell): RoofSlope {
  const { x: sx, z: sz } = sizeOf(spec.base);
  const slopesX = spec.kind === "hip" || sx < sz;
  const slopesZ = spec.kind === "hip" || sx >= sz;
  const { minX, maxX, minZ, maxZ } = layerAt(spec, cell.y - spec.base.min.y);
  if ((slopesX && minX === maxX) || (slopesZ && minZ === maxZ)) {
    return { kind: "ridge" };
  }

  const west = slopesX ? cell.x - minX : Infinity;
  const east = slopesX ? maxX - cell.x : Infinity;
  const north = slopesZ ? cell.z - minZ : Infinity;
  const south = slopesZ ? maxZ - cell.z : Infinity;
  const nearest = Math.min(west, east, north, south);
  if (west === nearest) return { kind: "slope", descends: "west" };
  if (east === nearest) return { kind: "slope", descends: "east" };
  if (north === nearest) return { kind: "slope", descends: "north" };
  return { kind: "slope", descends: "south" };
}

function interiorAt(
  spec: RoofSpec,
  layer: number,
  current: Rectangle,
): Rectangle | undefined {
  if (layer === spec.height - 1 || (layer === 0 && spec.style === "stepped")) {
    return undefined;
  }
  const above = layerAt(spec, layer + 1);
  // Layers above the eaves have a neighbour below because the rectangles nest.
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
