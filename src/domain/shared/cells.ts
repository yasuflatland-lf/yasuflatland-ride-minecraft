// Integer block cells and their saved coordinate keys.
import type { Vec3 } from "./vec";

/** Block cell, as integer coordinates. */
export type Cell = Vec3;

export function parseCell(raw: unknown): Cell | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { x, y, z } = raw as Cell;
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    !Number.isSafeInteger(z)
  )
    return undefined;
  return { x, y, z };
}

export function cellOf(v: Vec3): Cell {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) };
}

export const cellKey = (c: Cell): string => `${c.x},${c.y},${c.z}`;

export function sameCell(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** The horizontal midpoint, dy above the cell floor. */
export function cellCenter(c: Cell, dy = 0): Vec3 {
  return { x: c.x + 0.5, y: c.y + dy, z: c.z + 0.5 };
}

export function offsetToCellCenter(from: Vec3, cell: Cell): Vec3 {
  const center = cellCenter(cell, 0.5);
  return { x: center.x - from.x, y: center.y - from.y, z: center.z - from.z };
}
