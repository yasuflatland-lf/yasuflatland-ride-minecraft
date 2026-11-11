import type { Cell } from "./cells";

export function searchExitCell(
  start: Cell,
  excluded: (c: Cell) => boolean,
  ring: { radius: number; up: number; down: number },
  isSafe: (c: Cell) => boolean,
): Cell | undefined {
  for (let radius = 0; radius <= ring.radius; radius++)
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        for (let dy = ring.up; dy >= -ring.down; dy--) {
          const feet = { x: start.x + dx, y: start.y + dy, z: start.z + dz };
          if (excluded(feet)) continue;
          if (isSafe(feet)) return feet;
        }
      }
  return undefined;
}
