import type { BlockFace } from "../../shared/blockFace";
import { type Cell, cellOf } from "../../shared/cells";
import type { Vec3 } from "../../shared/vec";
import { boxOf, type CellBox, type Size } from "../box";
import {
  FACINGS,
  type Facing,
  facingVector,
  opposite,
  rightOf,
} from "../rotation/facing";

const DIRECTIONS = Object.fromEntries(
  FACINGS.map((facing) => {
    const forward = facingVector(facing);
    return [facing, { forward, right: rightOf(forward) }];
  }),
) as Record<Facing, { forward: Vec3; right: Vec3 }>;

export function placedPasteBox(
  anchor: Cell,
  size: Size,
  facing: Facing,
  face: BlockFace,
): CellBox {
  const vertical = face === "up" || face === "down";
  const { forward, right } = DIRECTIONS[vertical ? facing : opposite(face)];
  const forwardSign = vertical ? 1 : -1;
  return boxOf(
    anchor,
    cellOf({
      x: anchor.x + (right.x + forwardSign * forward.x) * (size.x - 1),
      y: anchor.y + size.y - 1,
      z: anchor.z + (right.z + forwardSign * forward.z) * (size.z - 1),
    }),
  );
}
