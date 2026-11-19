import type { Cell } from "../../shared/cells";
import type { BlockState } from "../blockState";

export interface Pattern {
  stateAt(cell: Cell): BlockState;
}

export function uniformPattern(state: BlockState): Pattern {
  return Object.freeze({ stateAt: () => state });
}
