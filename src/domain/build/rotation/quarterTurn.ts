import { rotatedQuarter, type Size } from "../box";

/** Clockwise quarter turns seen from above. */
export type QuarterTurn = 0 | 1 | 2 | 3;

export const NO_TURN: QuarterTurn = 0;

export function nextQuarterTurn(turn: QuarterTurn): QuarterTurn {
  return ((turn + 1) % 4) as QuarterTurn;
}

export function degreesOf(turn: QuarterTurn): 0 | 90 | 180 | 270 {
  return (90 * turn) as 0 | 90 | 180 | 270;
}

export function rotatedSize(size: Size, turn: QuarterTurn): Size {
  return Object.freeze(turn % 2 === 0 ? { ...size } : rotatedQuarter(size));
}
