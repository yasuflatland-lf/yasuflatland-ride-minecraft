import { type Cell, cellOf } from "./cells";
import { add3, type Vec3 } from "./vec";

export type BlockFace = "up" | "down" | "north" | "south" | "east" | "west";

export const FACE_OFFSET: Readonly<Record<BlockFace, Vec3>> = Object.freeze({
  up: Object.freeze({ x: 0, y: 1, z: 0 }),
  down: Object.freeze({ x: 0, y: -1, z: 0 }),
  north: Object.freeze({ x: 0, y: 0, z: -1 }),
  south: Object.freeze({ x: 0, y: 0, z: 1 }),
  east: Object.freeze({ x: 1, y: 0, z: 0 }),
  west: Object.freeze({ x: -1, y: 0, z: 0 }),
});

export function parseBlockFace(value: string): BlockFace | undefined {
  const face = value.toLowerCase();
  switch (face) {
    case "up":
    case "down":
    case "north":
    case "south":
    case "east":
    case "west":
      return face;
    default:
      return undefined;
  }
}

export function isTopFace(face: BlockFace): boolean {
  return face === "up";
}

export function anchorCell(block: Cell, face: BlockFace): Cell {
  return cellOf(add3(block, FACE_OFFSET[face]));
}
