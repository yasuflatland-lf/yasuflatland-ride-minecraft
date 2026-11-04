// Integer block cells and their saved coordinate keys.
import type { Vec3 } from "./vec";

/** Block cell, as integer coordinates. */
export type Cell = Vec3;

export function cellOf(v: Vec3): Cell {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) };
}

export const cellKey = (c: Cell): string => `${c.x},${c.y},${c.z}`;
