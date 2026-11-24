import type { Quarter } from "../../../shared/facing";
import type { DeckBlock, LightBlock } from "../../dock/floor";
import type { DecorItemId } from "./decorData";

/** The side of its cell a plate sits on, toward the room: 0 -z, 1 +z, 2 -x, 3 +x. */
export type Face = Quarter;

export type CamperRoomBlock =
  | DeckBlock
  | LightBlock
  /** Combined counter-decor block; drawer contents render on the entity (ADR 0121). */
  | {
      readonly type: "drawers";
      readonly face: Face;
      readonly height: number;
      readonly counter?: DecorItemId;
    }
  | { readonly type: "floor" }
  | { readonly type: "ceiling" }
  | { readonly type: "bed" }
  /** The upper bunk's block: no collision, selectable over the upper bunk (ADR 0182). */
  | { readonly type: "bunk" }
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
   * A wall cell behind the open shower door: the wall's plate on `face`, selectable, so a
   * tap on the open door lands on the shower-toilet (ADR 0118).
   */
  | { readonly type: "showerDoor"; readonly face: Face }
  /**
   * A decor item laid as yasu_ride:<item>_decor: `face` is the vehicle's yaw
   * quarter (quarterOf), `height` is 0..15 px, and `spot`
   * is where on the cell the item stands, 0 for the middle (ADR 0093, 0105).
   */
  | {
      readonly type: "decor";
      readonly item: DecorItemId;
      readonly face: Face;
      readonly height: number;
      readonly spot: number;
    }
  /**
   * The two items of a shelf board or the table laid as yasu_ride:<pair>_decor_pair, one block
   * that draws both: `end0` and `end1` are the items at its two ends, at least one of them
   * set; `face` and `height` are as on a decor block (ADR 0108). The camper lays no shelf pair
   * since the fridge took the shelf's place; one an older build laid is still read from the
   * saved cells, so the next lay replaces it (ADR 0123).
   */
  | {
      readonly type: "decorPair";
      readonly pair: "shelf" | "table";
      readonly face: Face;
      readonly height: number;
      readonly end0?: DecorItemId;
      readonly end1?: DecorItemId;
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
      readonly end0?: DecorItemId;
      readonly end1?: DecorItemId;
    }
  /** An open cabinet door, a plate on side `face` of its aisle cell under the ceiling (ADR 0114). */
  | { readonly type: "cabinetDoor"; readonly face: Face }
  /**
   * One compartment of the camper's fridge, laid as yasu_ride:fridge_decor_pair whether or not
   * it holds anything: as a cabinet compartment, lifted by `height` px, its compartment
   * floor (ADR 0123).
   */
  | {
      readonly type: "fridge";
      readonly face: Face;
      readonly height: number;
      readonly open: boolean;
      readonly end0?: DecorItemId;
      readonly end1?: DecorItemId;
    }
  /**
   * An open fridge door, a plate on side `face` of its aisle cell, without collision. `lit`
   * while the ceiling light whose cell it takes is on, so it gives that light (ADR 0115, 0123).
   */
  | { readonly type: "fridgeDoor"; readonly face: Face; readonly lit: boolean };
