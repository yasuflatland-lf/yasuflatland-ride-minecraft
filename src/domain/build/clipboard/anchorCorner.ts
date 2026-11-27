import { type Cell, cellOf } from "../../shared/cells";
import { boxFromSize, type CellBox, type Size } from "../box";
import { type Facing, facingVector, rightOf } from "../rotation/facing";
import type { QuarterTurn } from "../rotation/quarterTurn";

export type AnchorCorner = Readonly<{ x: "min" | "max"; z: "min" | "max" }>;

export function anchorCornerOf(
  box: CellBox,
  point1: Cell | undefined,
  facing: Facing,
): AnchorCorner {
  const forward = facingVector(facing);
  const right = rightOf(forward);
  function side(axis: "x" | "z") {
    if (box.min[axis] === box.max[axis]) return "min";
    const atMax = point1
      ? point1[axis] === box.max[axis]
      : forward[axis] + right[axis] < 0;
    return atMax ? "max" : "min";
  }
  return { x: side("x"), z: side("z") };
}

export function turnCorner(
  corner: AnchorCorner,
  turn: QuarterTurn,
): AnchorCorner {
  let result = corner;
  for (let i = 0; i < turn; i++)
    result = { x: result.z === "min" ? "max" : "min", z: result.x };
  return result;
}

export function boxAtCorner(
  anchor: Cell,
  size: Size,
  corner: AnchorCorner,
): CellBox {
  return boxFromSize(
    cellOf({
      x: anchor.x - (corner.x === "max" ? size.x - 1 : 0),
      y: anchor.y,
      z: anchor.z - (corner.z === "max" ? size.z - 1 : 0),
    }),
    size,
  );
}

export function cornerCell(box: CellBox, corner: AnchorCorner): Cell {
  return cellOf({ x: box[corner.x].x, y: box.min.y, z: box[corner.z].z });
}
