import type { Cell } from "../../shared/cells";
import { boxFromSize, type CellBox, sizeOf, unionOf } from "../box";
import { rotatedSize } from "./quarterTurn";

export type RotationPlan = {
  readonly source: CellBox;
  readonly target: CellBox;
  readonly union: CellBox;
};

function frozenBox({ min, max }: CellBox): CellBox {
  return Object.freeze({
    min: Object.freeze({ ...min }),
    max: Object.freeze({ ...max }),
  });
}

// Math.trunc yields -0 for a -1 / 2 difference, and toEqual tells -0 from 0.
function halfTowardZero(difference: number): number {
  return Math.trunc(difference / 2) + 0;
}

// An odd size difference leaves a half cell, which is rounded toward zero. A
// turn swaps the sizes, so the offsets of two consecutive turns are exact
// negatives and two turns return the box exactly (issue #1520).
export function planRotationAboutCenter(source: CellBox): RotationPlan {
  const size = sizeOf(source);
  const turned = rotatedSize(size, 1);
  const min: Cell = {
    x: source.min.x + halfTowardZero(size.x - size.z),
    y: source.min.y,
    z: source.min.z + halfTowardZero(size.z - size.x),
  };
  const target = frozenBox(boxFromSize(min, turned));
  const union = frozenBox(unionOf(source, target));
  return Object.freeze({
    source: frozenBox(source),
    target,
    union,
  });
}
