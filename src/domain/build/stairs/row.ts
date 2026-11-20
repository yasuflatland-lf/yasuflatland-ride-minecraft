import type { Cell } from "../../shared/cells";
import type { HorizontalAxis } from "../axis";
import { boxOf, cellsOf } from "../box";
import type { Taps } from "../flow/flow";

export interface StairRow {
  readonly y: number;
  readonly along: HorizontalAxis;
  readonly min: Cell;
  readonly max: Cell;
}

export function stairRowOf({ from, to }: Taps): StairRow | undefined {
  const differsX = from.x !== to.x;
  const differsZ = from.z !== to.z;
  if (from.y !== to.y || differsX === differsZ) return undefined;
  return { ...boxOf(from, to), y: from.y, along: differsX ? "x" : "z" };
}

export function rowCells(row: StairRow): Iterable<Cell> {
  return cellsOf(row);
}
