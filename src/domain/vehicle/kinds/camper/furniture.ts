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
  | "wall_cabinet"
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
  /** The furniture's top above the cell bottom, in pixels (0 to 15); 0 for the ceiling hook, where items hang. */
  readonly height: number;
}

interface Furniture {
  readonly kind: FurnitureKind;
  readonly cells: readonly LocalCell[];
  readonly slots: readonly DecorSlot[];
  /** Laid in every cell; furniture without one is drawn only by the model and can be walked through. */
  readonly block?: DockBlock;
}

// Slot heights are the furniture's top at the middle of the cell in tools/gen_camper.py, or 0
// for a hanging slot; tests/packs/camper.test.ts checks them against the generated model (ADR 0093).
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
  {
    kind: "stove",
    cells: [{ x: -1, z: -1, layer: 1 }],
    slots: [{ id: "stove", cell: { x: -1, z: -1, layer: 1 }, height: 14 }],
  },
  {
    kind: "counter",
    cells: [{ x: -1, z: -2, layer: 1 }],
    slots: [{ id: "counter", cell: { x: -1, z: -2, layer: 1 }, height: 14 }],
  },
  {
    kind: "wall_cabinet",
    cells: [
      { x: -1, z: -1, layer: 2 },
      { x: -1, z: -2, layer: 2 },
    ],
    slots: [
      {
        id: "wall_cabinet_front",
        cell: { x: -1, z: -1, layer: 2 },
        height: 13,
      },
      { id: "wall_cabinet_rear", cell: { x: -1, z: -2, layer: 2 }, height: 13 },
    ],
  },
  // Height 0: the item hangs from the hook under the ceiling plate instead of standing (ADR 0093).
  {
    kind: "ceiling_hook",
    cells: [{ x: 1, z: 0, layer: 2 }],
    slots: [{ id: "ceiling_hook", cell: { x: 1, z: 0, layer: 2 }, height: 0 }],
  },
  {
    kind: "shower_toilet",
    cells: [
      { x: -1, z: -3, layer: 1 },
      { x: -1, z: -3, layer: 2 },
    ],
    slots: [],
  },
];
