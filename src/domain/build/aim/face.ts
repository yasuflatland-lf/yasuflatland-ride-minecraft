import type { Cell } from "../../shared/cells";
import { add3 } from "../../shared/vec";

export type Face = "up" | "down" | "north" | "south" | "east" | "west";

export function anchorCell(block: Cell, face: Face): Cell {
  const offsets: Record<Face, Cell> = {
    up: { x: 0, y: 1, z: 0 },
    down: { x: 0, y: -1, z: 0 },
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 },
  };
  const offset = offsets[face];
  return add3(block, offset);
}

export function parseFace(value: string): Face | undefined {
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
