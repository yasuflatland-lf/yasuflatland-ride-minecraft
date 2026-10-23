// Integer block cells and their saved coordinate keys.
import type { Vec3 } from "./vec";

/** Block cell, as integer coordinates. */
export type Cell = Vec3;

export const cellKey = (c: Cell): string => `${c.x},${c.y},${c.z}`;
