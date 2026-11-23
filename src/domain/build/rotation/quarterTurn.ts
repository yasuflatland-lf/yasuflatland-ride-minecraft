import type { Quarter } from "../../shared/facing";
import type { Size } from "../box";

export { quarterDegrees as degreesOf } from "../../shared/facing";

/** Clockwise quarter turns seen from above. */
export type QuarterTurn = Quarter;

export const NO_TURN: QuarterTurn = 0;

export function nextQuarterTurn(turn: QuarterTurn): QuarterTurn {
  return ((turn + 1) % 4) as QuarterTurn;
}

export function rotatedSize(size: Size, turn: QuarterTurn): Size {
  return Object.freeze(
    turn % 2 === 0 ? { ...size } : { x: size.z, y: size.y, z: size.x },
  );
}
