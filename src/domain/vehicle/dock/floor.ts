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
  /**
   * A decor slot with no decor (yasu_ride:camper_furniture): no collision, a selection
   * box over the furniture top; `height` is the slot's 0..15 px, 0 for a hanging slot (ADR 0097).
   */
  | { readonly type: "furniture"; readonly height: number }
  | { readonly type: "wall"; readonly face: Face }
  | { readonly type: "door"; readonly face: Face; readonly open: boolean }
  /** The shower-toilet's block: selectable only by a plate on `face`, toward the aisle (ADR 0098). */
  | { readonly type: "showerToilet"; readonly face: Face }
  /**
   * A decor item laid as yasu_ride:<item>_decor: `face` is the vehicle's yaw
   * quarter (decorFace), not a side of the cell, `height` is 0..15 px, and `spot`
   * is where on the cell the item stands, 0 for the middle (ADR 0093, 0105).
   */
  | {
      readonly type: "decor";
      readonly item: string;
      readonly face: Face;
      readonly height: number;
      readonly spot: number;
    };

export interface DockCell extends Cell {
  readonly block: DockBlock;
}

export function sameBlock(a: DockBlock, b: DockBlock): boolean {
  switch (a.type) {
    case "deck":
      return b.type === "deck" && a.height === b.height;
    case "furniture":
      return b.type === "furniture" && a.height === b.height;
    case "wall":
      return b.type === "wall" && a.face === b.face;
    case "door":
      return b.type === "door" && a.face === b.face && a.open === b.open;
    case "showerToilet":
      return b.type === "showerToilet" && a.face === b.face;
    case "decor":
      return (
        b.type === "decor" &&
        a.item === b.item &&
        a.face === b.face &&
        a.height === b.height &&
        a.spot === b.spot
      );
    default:
      return a.type === b.type;
  }
}

/**
 * Cells to clear and cells to place or replace to go from laid to wanted. A laid
 * cell that `lost` says the world no longer holds is placed again (ADR 0096).
 */
export function refloor(
  laid: readonly DockCell[],
  wanted: readonly DockCell[],
  lost: (cell: DockCell) => boolean = () => false,
): { clear: DockCell[]; place: DockCell[] } {
  const laidByKey = new Map(laid.map((c) => [cellKey(c), c]));
  const wantedKeys = new Set(wanted.map(cellKey));
  return {
    clear: laid.filter((c) => !wantedKeys.has(cellKey(c))),
    place: wanted.filter((c) => {
      const before = laidByKey.get(cellKey(c));
      return (
        before === undefined ||
        !sameBlock(before.block, c.block) ||
        lost(before)
      );
    }),
  };
}
