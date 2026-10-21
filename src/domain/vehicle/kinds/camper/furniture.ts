// The camper's furniture in local room cells: what it fills and where decor stands on it (ADR 0093).
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
  /** The index in DECOR_SPOTS of where on its cell the item stands; the cell middle when omitted (ADR 0105). */
  readonly spot?: number;
}

/** A point on a cell's top in pixels from the cell middle: `left` and `forward` as in LocalCell. */
export interface DecorSpot {
  readonly left: number;
  readonly forward: number;
}

// Index = a decor block's yasu_ride:spot state; tools/gen_camping_gear.py lists the same
// offsets and tests/packs/campingGear.test.ts ties its translations to them. 0 is the cell
// middle; 1 to 4 are the stove burners, whose centers in tools/gen_camper.py are 3.8 px
// either side of the cell middle across the aisle and 5.4 px toward the sink or 5.35 px
// toward the far flange. The wall-side spots sit 0.5 px in from their burner centers so the
// widest item (7 px) clears the wall at 22.8 px; they stay on the 3.2 px grate (ADR 0105).
export const DECOR_SPOTS: readonly DecorSpot[] = [
  { left: 0, forward: 0 },
  { left: 3.8, forward: 5.4 },
  { left: 3.8, forward: -5.35 },
  { left: -3.3, forward: 5.4 },
  { left: -3.3, forward: -5.35 },
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

// Slot heights are the furniture's top at the slot's spot in tools/gen_camper.py, or, for
// a hanging slot, 16 minus the hanging items' height; tests/packs/camper.test.ts checks them
// against the generated model (ADR 0093, 0102).
export const CAMPER_FURNITURE: readonly Furniture[] = [
  {
    kind: "dashboard",
    cells: [
      { x: -1, z: 3, layer: 1 },
      { x: 0, z: 3, layer: 1 },
      { x: 1, z: 3, layer: 1 },
    ],
    slots: [
      { id: "dashboard_center", cell: { x: 0, z: 3, layer: 1 }, height: 13 },
      { id: "dashboard_left", cell: { x: 1, z: 3, layer: 1 }, height: 13 },
    ],
  },
  {
    kind: "table",
    cells: [{ x: 1, z: 0, layer: 1 }],
    slots: [{ id: "table", cell: { x: 1, z: 0, layer: 1 }, height: 12 }],
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
  {
    kind: "shelf",
    cells: [
      { x: -1, z: 1, layer: 1 },
      { x: -1, z: 1, layer: 2 },
    ],
    slots: [
      { id: "shelf_low", cell: { x: -1, z: 1, layer: 1 }, height: 10 },
      { id: "shelf_high", cell: { x: -1, z: 1, layer: 2 }, height: 4 },
    ],
  },
  // The sink is in front of the stove, as on the real range (ADR 0100). One slot per burner,
  // all in one cell, so the stove holds one item; "stove" keeps its id for saved decor. Height
  // 15 stands the item on the burner grate, whose prongs reach 14.95 px (ADR 0105).
  {
    kind: "stove",
    cells: [STOVE_CELL],
    slots: [
      { id: "stove", cell: STOVE_CELL, height: 15, spot: 1 },
      { id: "stove_rear", cell: STOVE_CELL, height: 15, spot: 2 },
      { id: "stove_wall", cell: STOVE_CELL, height: 15, spot: 3 },
      { id: "stove_wall_rear", cell: STOVE_CELL, height: 15, spot: 4 },
    ],
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
