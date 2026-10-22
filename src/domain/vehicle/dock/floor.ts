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
  /** A ceiling light's glow: a light block, invisible and without collision (ADR 0115). */
  | { readonly type: "light" }
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
    }
  /**
   * The two items of a shelf board or the table laid as yasu_ride:<pair>_decor_pair, one block
   * that draws both: `end0` and `end1` are the items at its two ends, at least one of them
   * set; `face` and `height` are as on a decor block (ADR 0108).
   */
  | {
      readonly type: "decorPair";
      readonly pair: "shelf" | "table";
      readonly face: Face;
      readonly height: number;
      readonly end0?: string;
      readonly end1?: string;
    }
  /**
   * One compartment of the camper's wall cabinet, laid as yasu_ride:cabinet_decor_pair whether
   * or not it holds anything: `end0` and `end1` are its items, either or both unset, drawn only
   * while `open`; `face` is the vehicle's yaw quarter as on a decor block (ADR 0114).
   */
  | {
      readonly type: "cabinet";
      readonly face: Face;
      readonly open: boolean;
      readonly end0?: string;
      readonly end1?: string;
    }
  /** An open cabinet door, a plate on side `face` of its aisle cell under the ceiling (ADR 0114). */
  | { readonly type: "cabinetDoor"; readonly face: Face };

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
    case "cabinetDoor":
      return b.type === "cabinetDoor" && a.face === b.face;
    case "cabinet":
      return (
        b.type === "cabinet" &&
        a.face === b.face &&
        a.open === b.open &&
        a.end0 === b.end0 &&
        a.end1 === b.end1
      );
    case "decor":
      return (
        b.type === "decor" &&
        a.item === b.item &&
        a.face === b.face &&
        a.height === b.height &&
        a.spot === b.spot
      );
    case "decorPair":
      return (
        b.type === "decorPair" &&
        a.pair === b.pair &&
        a.face === b.face &&
        a.height === b.height &&
        a.end0 === b.end0 &&
        a.end1 === b.end1
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
