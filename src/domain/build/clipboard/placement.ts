import type { Cell } from "../../shared/cells";
import type { Face } from "../aim/face";
import { boxOf, type CellBox, type Size } from "../box";
import type { Facing } from "../rotation/facing";

type HorizontalDirection = { readonly x: number; readonly z: number };

const DIRECTIONS: Record<
  Facing,
  { readonly forward: HorizontalDirection; readonly right: HorizontalDirection }
> = {
  north: { forward: { x: 0, z: -1 }, right: { x: 1, z: 0 } },
  east: { forward: { x: 1, z: 0 }, right: { x: 0, z: 1 } },
  south: { forward: { x: 0, z: 1 }, right: { x: -1, z: 0 } },
  west: { forward: { x: -1, z: 0 }, right: { x: 0, z: -1 } },
};

const OPPOSITE: Record<Facing, Facing> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

export function placedPasteBox(
  anchor: Cell,
  size: Size,
  facing: Facing,
  face: Face,
): CellBox {
  const vertical = face === "up" || face === "down";
  const { forward, right } = DIRECTIONS[vertical ? facing : OPPOSITE[face]];
  const forwardSign = vertical ? 1 : -1;
  return boxOf(anchor, {
    x: anchor.x + (right.x + forwardSign * forward.x) * (size.x - 1),
    y: anchor.y + size.y - 1,
    z: anchor.z + (right.z + forwardSign * forward.z) * (size.z - 1),
  });
}
