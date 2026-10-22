// The camper's furniture in local room cells: what it fills and where decor stands on it (ADR 0093).
import type { DockBlock } from "../../dock/floor";

type FurnitureKind =
  | "dashboard"
  | "table"
  | "dinette_seat"
  | "bed"
  | "shelf"
  | "stove"
  | "counter"
  | "ceiling_hook"
  | "shower_toilet";

/** A cell in room.ts coordinates: x = left (-1..1), z = forward (-3..3), layer = cells above the floor layer. */
export interface LocalCell {
  readonly x: number;
  readonly z: number;
  readonly layer: number;
}

/** A furniture whose one cell holds two items, each drawn by the cell's one pair block (ADR 0108). */
type DecorPairKind = Extract<DockBlock, { type: "decorPair" }>["pair"];

/** One end of a furniture that holds two items in one cell (ADR 0108). */
interface DecorPairEnd {
  readonly kind: DecorPairKind;
  readonly end: 0 | 1;
}

/** A place for one decor item. Its id is saved with the decor, so it never changes. */
export interface DecorSlot {
  readonly id: string;
  readonly cell: LocalCell;
  /**
   * The furniture's top above the cell bottom, in pixels (0 to 15). For a hanging slot, the lift
   * that puts a hanging item's top at the top of the cell: 16 minus the hanging items' height (ADR 0102).
   */
  readonly height: number;
  /** Items hang from this slot instead of standing on it (ADR 0093, 0102). */
  readonly hanging?: true;
  /** The index in DECOR_SPOTS of where on its cell the item stands; the cell middle when omitted (ADR 0107). */
  readonly spot?: number;
  /**
   * The end of a two-item furniture this slot is. Its item is drawn by the cell's pair block
   * with the other end's, so the cell holds one item per end instead of one in all (ADR 0108).
   */
  readonly pair?: DecorPairEnd;
}

/** A point on a cell's top in pixels from the cell middle: `left` and `forward` as in LocalCell. */
export interface DecorSpot {
  readonly left: number;
  readonly forward: number;
}

// Indexes 0 to 4 are a decor block's yasu_ride:spot state; tools/gen_camping_gear.py lists the same
// offsets and tests/packs/campingGear.test.ts ties its translations to them. 0 is the cell
// middle. 1 to 4 were the four stove burners of ADR 0107; no slot uses them since the stove
// got one burner in its middle (ADR 0112). They stay so every index keeps its meaning and a
// decor block an older build laid on a burner still draws there until the next lay clears it.
// 5 to 8 are the ends of a shelf board and of the table, where a pair block draws both items
// at once, so they are not yasu_ride:spot values; tools/gen_camping_gear.py places the items
// in the pair geometry at the same offsets (ADR 0108). Each 14 px board runs 7 px either side
// of the cell middle along the camper and the deepest item reaches 3 px forward and back, so
// the ends sit 3.5 px either side: 0.5 px from each end panel and 1 px apart. The table top
// runs 7 px either side across the camper and the widest item reaches 3.5 px to each side:
// the wall side sits 3.3 px toward the wall, clear of its inner face at 22.8 px, and the
// aisle side 3.7 px toward the aisle, so the two cannot touch.
export const DECOR_SPOTS: readonly DecorSpot[] = [
  { left: 0, forward: 0 },
  { left: 3.8, forward: 5.4 },
  { left: 3.8, forward: -5.35 },
  { left: -3.3, forward: 5.4 },
  { left: -3.3, forward: -5.35 },
  { left: 0, forward: -3.5 },
  { left: 0, forward: 3.5 },
  { left: 3.3, forward: 0 },
  { left: -3.7, forward: 0 },
];

/** A room block a piece of furniture fills its cells with; roomCells turns a faced one toward the aisle (ADR 0092, 0098). */
export type FurnitureBlock =
  | { readonly type: "bed" }
  | { readonly type: "showerToilet" };

interface Furniture {
  readonly kind: FurnitureKind;
  readonly cells: readonly LocalCell[];
  readonly slots: readonly DecorSlot[];
  /** Laid in every cell; furniture without one is drawn only by the model and can be walked through. */
  readonly block?: FurnitureBlock;
}

// The shower-toilet's two cells; their block opens the shower door or runs the shower (ADR 0094, 0098).
const SHOWER_TOILET_CELLS = [
  { x: -1, z: -3, layer: 1 },
  { x: -1, z: -3, layer: 2 },
] as const satisfies readonly LocalCell[];

const STOVE_CELL = { x: -1, z: -2, layer: 1 } as const satisfies LocalCell;
const TABLE_CELL = { x: 1, z: 0, layer: 1 } as const satisfies LocalCell;
const SHELF_LOW_CELL = { x: -1, z: 1, layer: 1 } as const satisfies LocalCell;
const SHELF_HIGH_CELL = { x: -1, z: 1, layer: 2 } as const satisfies LocalCell;

// Slot heights are the furniture's top at the slot's spot in tools/gen_camper.py, or, for
// a hanging slot, 16 minus the hanging items' height; tests/packs/camper.test.ts checks them
// against the generated model (ADR 0093, 0102).
export const CAMPER_FURNITURE: readonly Furniture[] = [
  // The dash top is at 35 px, 3 px into layer 2, just under the windshield (ADR 0106).
  {
    kind: "dashboard",
    cells: [
      { x: -1, z: 3, layer: 2 },
      { x: 0, z: 3, layer: 2 },
      { x: 1, z: 3, layer: 2 },
    ],
    slots: [
      { id: "dashboard_center", cell: { x: 0, z: 3, layer: 2 }, height: 3 },
      { id: "dashboard_left", cell: { x: 1, z: 3, layer: 2 }, height: 3 },
    ],
  },
  // Two items across the table, drawn by one pair block. "table" keeps its id for saved
  // decor at the wall side (ADR 0108).
  {
    kind: "table",
    cells: [TABLE_CELL],
    slots: [
      {
        id: "table",
        cell: TABLE_CELL,
        height: 12,
        spot: 7,
        pair: { kind: "table", end: 0 },
      },
      {
        id: "table_aisle",
        cell: TABLE_CELL,
        height: 12,
        spot: 8,
        pair: { kind: "table", end: 1 },
      },
    ],
  },
  {
    kind: "dinette_seat",
    cells: [
      { x: 1, z: 1, layer: 1 },
      { x: 1, z: -1, layer: 1 },
    ],
    slots: [
      { id: "dinette_front", cell: { x: 1, z: 1, layer: 1 }, height: 7 },
      { id: "dinette_rear", cell: { x: 1, z: -1, layer: 1 }, height: 7 },
    ],
  },
  // The model's bed at the rear left, 9 px high (tools/gen_camper.py, ADR 0092).
  {
    kind: "bed",
    cells: [
      { x: 1, z: -2, layer: 1 },
      { x: 1, z: -3, layer: 1 },
    ],
    slots: [],
    block: { type: "bed" },
  },
  // Two items along each board, drawn by one pair block per board. The rear ends keep the
  // boards' ids for saved decor (ADR 0108).
  {
    kind: "shelf",
    cells: [SHELF_LOW_CELL, SHELF_HIGH_CELL],
    slots: [
      {
        id: "shelf_low",
        cell: SHELF_LOW_CELL,
        height: 10,
        spot: 5,
        pair: { kind: "shelf", end: 0 },
      },
      {
        id: "shelf_low_front",
        cell: SHELF_LOW_CELL,
        height: 10,
        spot: 6,
        pair: { kind: "shelf", end: 1 },
      },
      {
        id: "shelf_high",
        cell: SHELF_HIGH_CELL,
        height: 4,
        spot: 5,
        pair: { kind: "shelf", end: 0 },
      },
      {
        id: "shelf_high_front",
        cell: SHELF_HIGH_CELL,
        height: 4,
        spot: 6,
        pair: { kind: "shelf", end: 1 },
      },
    ],
  },
  // The sink is in front of the stove, as on the real range (ADR 0100). The stove's one burner
  // is in the middle of its cell; height 15 stands the item on the burner grate, whose prongs
  // reach 14.95 px (ADR 0107, 0112).
  {
    kind: "stove",
    cells: [STOVE_CELL],
    slots: [{ id: "stove", cell: STOVE_CELL, height: 15 }],
  },
  {
    kind: "counter",
    cells: [{ x: -1, z: -1, layer: 1 }],
    slots: [{ id: "counter", cell: { x: -1, z: -1, layer: 1 }, height: 14 }],
  },
  // Height 6 lifts the 10 px hanging planter so its top meets the hook at the top of the cell (ADR 0099, 0102).
  {
    kind: "ceiling_hook",
    cells: [{ x: 1, z: 0, layer: 2 }],
    slots: [
      {
        id: "ceiling_hook",
        cell: { x: 1, z: 0, layer: 2 },
        height: 6,
        hanging: true,
      },
    ],
  },
  {
    kind: "shower_toilet",
    cells: SHOWER_TOILET_CELLS,
    slots: [],
    block: { type: "showerToilet" },
  },
];
