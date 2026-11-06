import type { Cell } from "../shared/cells";

/** Finds the first two-air-cell space at or above start, treating above topY as air. */
export function freeCellAbove(
  start: Cell,
  isAir: (cell: Cell) => boolean,
  topY: number,
): Cell | undefined {
  const airAt = (cell: Cell) => cell.y > topY || isAir(cell);
  for (let y = start.y; y <= Math.max(start.y, topY + 1); y++) {
    const feet = { ...start, y };
    if (airAt(feet) && airAt({ ...feet, y: y + 1 })) return feet;
  }
  return undefined;
}
