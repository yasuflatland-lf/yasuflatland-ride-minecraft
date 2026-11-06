// The footprint and heights a terrain operation reads from two points (ADR 0233).
import type { Cell } from "../../shared/cells";
import type { CellBox } from "../box";
import { BUILD_SPEC } from "../spec";

export type TerrainOp = "removeAbove";

export interface TerrainArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly lowerY: number;
  readonly higherY: number;
}

export function terrainAreaOf(from: Cell, to: Cell): TerrainArea {
  return {
    minX: Math.min(from.x, to.x),
    maxX: Math.max(from.x, to.x),
    minZ: Math.min(from.z, to.z),
    maxZ: Math.max(from.z, to.z),
    lowerY: Math.min(from.y, to.y),
    higherY: Math.max(from.y, to.y),
  };
}

export function terrainSides(area: TerrainArea): { x: number; z: number } {
  return { x: area.maxX - area.minX + 1, z: area.maxZ - area.minZ + 1 };
}

export function fitsTerrainLimit(area: TerrainArea): boolean {
  const sides = terrainSides(area);
  return (
    sides.x <= BUILD_SPEC.maxTerrainSide && sides.z <= BUILD_SPEC.maxTerrainSide
  );
}

/** The lower layer stays as the floor, so a floor at the world top leaves nothing to remove. */
export function removeAboveBox(area: TerrainArea): CellBox | undefined {
  if (area.lowerY >= BUILD_SPEC.worldTopY) return undefined;
  return {
    min: { x: area.minX, y: area.lowerY + 1, z: area.minZ },
    max: { x: area.maxX, y: BUILD_SPEC.worldTopY, z: area.maxZ },
  };
}
