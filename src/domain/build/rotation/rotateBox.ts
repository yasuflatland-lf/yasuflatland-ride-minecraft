import { type Cell, cellOf } from "../../shared/cells";
import { boxFromSize, type CellBox, sizeOf, unionOf } from "../box";
import { rotatedSize } from "./quarterTurn";

export type RotationPlan = {
  readonly target: CellBox;
  readonly union: CellBox;
};

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
  const min: Cell = cellOf({
    x: source.min.x + halfTowardZero(size.x - size.z),
    y: source.min.y,
    z: source.min.z + halfTowardZero(size.z - size.x),
  });
  const target = boxFromSize(min, turned);
  const union = unionOf(source, target);
  return Object.freeze({ target, union });
}
