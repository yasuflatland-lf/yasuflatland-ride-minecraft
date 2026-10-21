// Kind-neutral hold pose and the cells a stopped vehicle lays (ADR 0063, 0068).
import { type Cell, cellKey } from "../lighting/headlights";

export interface HoldPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** The side of its cell a plate sits on, toward the room: 0 -z, 1 +z, 2 -x, 3 +x. */
export type Face = 0 | 1 | 2 | 3;

export type DockBlock =
  /** Collision height in pixels, 1..16 (yasu_ride:deck_floor). */
  | { readonly type: "deck"; readonly height: number }
  | { readonly type: "floor" }
  | { readonly type: "ceiling" }
  | { readonly type: "bed" }
  | { readonly type: "wall"; readonly face: Face }
  | { readonly type: "door"; readonly face: Face; readonly open: boolean };

export interface DockCell extends Cell {
  readonly block: DockBlock;
}

export function sameBlock(a: DockBlock, b: DockBlock): boolean {
  switch (a.type) {
    case "deck":
      return b.type === "deck" && a.height === b.height;
    case "wall":
      return b.type === "wall" && a.face === b.face;
    case "door":
      return b.type === "door" && a.face === b.face && a.open === b.open;
    default:
      return a.type === b.type;
  }
}

/** Cells to clear and cells to place or replace to go from laid to wanted. */
export function refloor(
  laid: readonly DockCell[],
  wanted: readonly DockCell[],
): { clear: DockCell[]; place: DockCell[] } {
  const laidByKey = new Map(laid.map((c) => [cellKey(c), c]));
  const wantedKeys = new Set(wanted.map(cellKey));
  return {
    clear: laid.filter((c) => !wantedKeys.has(cellKey(c))),
    place: wanted.filter((c) => {
      const before = laidByKey.get(cellKey(c));
      return before === undefined || !sameBlock(before.block, c.block);
    }),
  };
}
