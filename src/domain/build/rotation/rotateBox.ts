import type { Cell } from "../../shared/cells";
import type { CellBox } from "../box";
import { rotatedSize } from "./quarterTurn";

export type RotationPlan = {
  readonly source: CellBox;
  readonly target: CellBox;
  readonly union: CellBox;
};

function frozenBox(min: Cell, max: Cell): CellBox {
  return Object.freeze({
    min: Object.freeze({ ...min }),
    max: Object.freeze({ ...max }),
  });
}

// An odd size difference leaves a half cell; flooring it is the fixed center
// rule of issue #1520, so repeated turns may drift by at most one cell per axis.
export function planRotationAboutCenter(source: CellBox): RotationPlan {
  const size: Cell = {
    x: source.max.x - source.min.x + 1,
    y: source.max.y - source.min.y + 1,
    z: source.max.z - source.min.z + 1,
  };
  const turned = rotatedSize(size, 1);
  const min: Cell = {
    x: source.min.x + Math.floor((size.x - size.z) / 2),
    y: source.min.y,
    z: source.min.z + Math.floor((size.z - size.x) / 2),
  };
  const target = frozenBox(min, {
    x: min.x + turned.x - 1,
    y: min.y + turned.y - 1,
    z: min.z + turned.z - 1,
  });
  const union = frozenBox(
    {
      x: Math.min(source.min.x, target.min.x),
      y: source.min.y,
      z: Math.min(source.min.z, target.min.z),
    },
    {
      x: Math.max(source.max.x, target.max.x),
      y: source.max.y,
      z: Math.max(source.max.z, target.max.z),
    },
  );
  return Object.freeze({
    source: frozenBox(source.min, source.max),
    target,
    union,
  });
}
