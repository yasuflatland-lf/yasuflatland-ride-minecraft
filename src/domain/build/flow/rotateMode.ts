import { nextQuarterTurn, type QuarterTurn } from "../rotation/quarterTurn";
import type { Selection } from "../selection";

export type RotateMode = {
  readonly kind: "rotateMode";
  readonly selection: Selection;
  readonly turn: QuarterTurn;
};

export function beginRotateMode(
  selection: Selection,
  turn: QuarterTurn,
): RotateMode {
  return Object.freeze({ kind: "rotateMode", selection, turn });
}

export function turnRotateMode(
  mode: RotateMode,
  selection: Selection,
): RotateMode {
  return beginRotateMode(selection, nextQuarterTurn(mode.turn));
}
