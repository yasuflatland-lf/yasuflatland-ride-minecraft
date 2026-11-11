import type { DimensionId } from "../../shared/ids";
import type { BlockState } from "../blockState";
import type { CellBox } from "../box";
import { nextQuarterTurn, type QuarterTurn } from "../rotation/quarterTurn";

export type RotateMode = {
  readonly kind: "rotateMode";
  readonly dimensionId: DimensionId;
  readonly box: CellBox;
  readonly turn: QuarterTurn;
  readonly material: BlockState;
};

export function beginRotateMode(
  dimensionId: DimensionId,
  box: CellBox,
  material: BlockState,
  turn: QuarterTurn,
): RotateMode {
  return Object.freeze({
    kind: "rotateMode",
    dimensionId,
    box,
    material,
    turn,
  });
}

export function turnRotateMode(mode: RotateMode, target: CellBox): RotateMode {
  return Object.freeze({
    ...mode,
    box: target,
    turn: nextQuarterTurn(mode.turn),
  });
}
