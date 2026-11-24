// The footprint and heights a terrain operation reads from two points (ADR 0233).
import type { Cell } from "../../shared/cells";
import { type CellBox, cellBox } from "../box";
import { BUILD_SPEC } from "../spec";

export type TerrainOp = "removeAbove" | "fillBelow";

export interface TerrainArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly lowerY: number;
  readonly higherY: number;
}

/**
 * The footprint follows the selected box, which Rotate can turn, while the
 * heights stay those of the two tapped points whatever the live height or
 * later confirms did to the box.
 */
export function terrainAreaOf(box: CellBox, from: Cell, to: Cell): TerrainArea {
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
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
  return cellBox(
    { x: area.minX, y: area.lowerY + 1, z: area.minZ },
    { x: area.maxX, y: BUILD_SPEC.worldTopY, z: area.maxZ },
  );
}

export function fillBelowBox(area: TerrainArea, bottomY: number): CellBox {
  return cellBox(
    { x: area.minX, y: bottomY, z: area.minZ },
    { x: area.maxX, y: area.higherY, z: area.maxZ },
  );
}
