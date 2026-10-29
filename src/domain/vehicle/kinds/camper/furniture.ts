// The camper's furniture in local room cells: what it fills and where decor stands on it (ADR 0093).
import type { DockBlock } from "../../dock/floor";
import {
  type DooredStorage,
  type StorageDoor,
  type StorageSlot,
  storageDoors,
  storageFurniture,
} from "./dooredStorage";

type FurnitureKind =
  | "dashboard"
  | "table"
  | "dinette_seat"
  | "bed"
  | "bunk"
  | "fridge"
  | "stove"
  | "counter"
  | "ceiling_hook"
  | "shower_toilet"
  | "wall_cabinet";

/** A cell in room.ts coordinates: x = left (-1..1), z = forward (-3..3), layer = cells above the floor layer. */
export interface LocalCell {
  readonly x: number;
  readonly z: number;
  readonly layer: number;
}

/**
 * A furniture whose one cell holds two items, each drawn by the cell's one pair block (ADR 0108),
 * or a storage compartment, whose own block draws its two (ADR 0114, 0121).
 */
type DecorPairKind =
  | Extract<DockBlock, { type: "decorPair" }>["pair"]
  | StoragePairKind;

/** The pair kind of a storage compartment, whose block compartmentCells lays (ADR 0114, 0121). */
type StoragePairKind = "cabinet" | "fridge";

/** The blocks a storage compartment lays; a new unit adds its own here (ADR 0121). */
export type StorageCompartmentBlock = Extract<
  DockBlock,
  { type: "cabinet" | "fridge" }
>;
/** The blocks an open storage door's plate lays; a new unit adds its own here (ADR 0121). */
export type StoragePlateBlock = Extract<
  DockBlock,
  { type: "cabinetDoor" | "fridgeDoor" }
>;

/**
 * A door of the camper's storage (ADR 0121): a wall cabinet door, named after what its
 * compartment hangs over (ADR 0114), or a fridge door, the shorter top one or the taller
 * bottom one (ADR 0123). Each needs an entity property (entity.ts STORAGE_DOOR_PROPERTY).
 */
export type StorageDoorId = "sink" | "stove" | "fridge_top" | "fridge_bottom";

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
  /** The storage door the slot is behind: it takes and gives items only while that door is open (ADR 0114, 0121). */
  readonly door?: StorageDoorId;
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
// aisle side 3.7 px toward the aisle, so the two cannot touch. A wall cabinet compartment
// is about as long as a board, so its two items use the boards' spots 5 and 6 (ADR 0114).
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
  | { readonly type: "bunk" }
  | { readonly type: "showerToilet" };

/** Furniture block types a press sleeps on (ADR 0092, 0182). */
export const SLEEP_BLOCKS: ReadonlySet<FurnitureBlock["type"]> = new Set([
  "bed",
  "bunk",
]);

interface Furniture {
  readonly kind: FurnitureKind;
  readonly cells: readonly LocalCell[];
  readonly slots: readonly DecorSlot[];
  /** Laid in every cell; furniture without one is drawn only by the model and can be walked through. */
  readonly block?: FurnitureBlock;
  /** Where a press on this furniture's sleeping block sets the spawn point; absent = the pressed cell (ADR 0092, 0182). */
  readonly spawn?: LocalCell;
}

// The shower-toilet's two cells; their block opens the shower door or runs the shower (ADR 0094, 0098).
const SHOWER_TOILET_CELLS = [
  { x: -1, z: -3, layer: 1 },
  { x: -1, z: -3, layer: 2 },
] as const satisfies readonly LocalCell[];

const STOVE_CELL = { x: -1, z: -2, layer: 1 } as const satisfies LocalCell;
// The wall cabinet hangs under the ceiling plate, in the ceiling layer (room.ts CEILING_LAYER),
// one compartment over the sink and one over the stove (ADR 0103, 0114).
const CABINET_LAYER = 3;
const SINK_CABINET_CELL = {
  x: -1,
  z: -1,
  layer: CABINET_LAYER,
} as const satisfies LocalCell;
const STOVE_CABINET_CELL = {
  x: -1,
  z: -2,
  layer: CABINET_LAYER,
} as const satisfies LocalCell;
// The compartment floor's top above the cabinet cell's bottom, in pixels: model y 51
// (tools/gen_camper.py CABINET_Y) in a cell from 48 (ADR 0114).
const CABINET_SHELF_HEIGHT = 3;

/**
 * The two ends of a compartment of pair kind `kind` behind door `door`, at the shelf boards'
 * end spots 5 and 6; the ids name the rear end, then the front end.
 */
function compartmentSlots<Id extends StorageDoorId>(
  kind: StoragePairKind,
  door: Id,
  cell: LocalCell,
  height: number,
  [rear, front]: readonly [string, string],
): StorageSlot<Id>[] {
  return [
    { id: rear, cell, height, spot: 5, pair: { kind, end: 0 }, door },
    { id: front, cell, height, spot: 6, pair: { kind, end: 1 }, door },
  ];
}

// Each door hangs on the compartment's outer end, so the open doors stand at the cabinet's two
// ends, in the aisle cells beside their compartments, and leave the middle free
// (tools/gen_camper.py, ADR 0114).
export const WALL_CABINET: DooredStorage<StorageDoorId, StoragePairKind> = {
  pairKind: "cabinet",
  doors: [
    {
      id: "sink",
      compartment: SINK_CABINET_CELL,
      plate: { x: 0, z: SINK_CABINET_CELL.z, layer: CABINET_LAYER },
      hinge: 1,
      slots: compartmentSlots(
        "cabinet",
        "sink",
        SINK_CABINET_CELL,
        CABINET_SHELF_HEIGHT,
        ["cabinet_sink_rear", "cabinet_sink_front"],
      ),
    },
    {
      id: "stove",
      compartment: STOVE_CABINET_CELL,
      plate: { x: 0, z: STOVE_CABINET_CELL.z, layer: CABINET_LAYER },
      hinge: -1,
      slots: compartmentSlots(
        "cabinet",
        "stove",
        STOVE_CABINET_CELL,
        CABINET_SHELF_HEIGHT,
        ["cabinet_stove_rear", "cabinet_stove_front"],
      ),
    },
  ],
  // The cabinet block has one height, set by its permutations, so the look's height is unused.
  compartmentBlock: ({ face, open, end0, end1 }) => ({
    type: "cabinet",
    face,
    open,
    ...(end0 === undefined ? {} : { end0 }),
    ...(end1 === undefined ? {} : { end1 }),
  }),
  // The plates stand under the ceiling, where no light hangs, so `lit` is always false.
  plateBlock: ({ face }) => ({ type: "cabinetDoor", face }),
  // The namespace-free name of yasu_ride:camper_cabinet_door; identifiers.test.ts checks it.
  plateBlockName: "camper_cabinet_door",
};

// The fridge stands where the two-board shelf stood, behind the driver, its two compartments
// in the shelf's two cells (ADR 0123).
const FRIDGE_BOTTOM_CELL = {
  x: -1,
  z: 1,
  layer: 1,
} as const satisfies LocalCell;
const FRIDGE_TOP_CELL = { x: -1, z: 1, layer: 2 } as const satisfies LocalCell;
// The compartment floors' tops above their cells' bottoms, in pixels: the bottom panel tops at
// model y 19, over the front wheel arch, and the divider between the compartments at 36
// (tools/gen_camper.py FRIDGE_FLOOR_Y and FRIDGE_DIVIDER_Y, ADR 0123).
const FRIDGE_BOTTOM_HEIGHT = 3;
const FRIDGE_TOP_HEIGHT = 4;

// Both doors hang on the fridge's front end, toward the cab, so an open one stands across the
// aisle cell beside the fridge, against the front seats' backs, and leaves the way from the
// entry door to the compartments free. The top door's plate takes the front ceiling light's
// cell and gives its light while the lights are on (tools/gen_camper.py, ADR 0115, 0123).
export const FRIDGE: DooredStorage<StorageDoorId, StoragePairKind> = {
  pairKind: "fridge",
  doors: [
    {
      id: "fridge_bottom",
      compartment: FRIDGE_BOTTOM_CELL,
      plate: {
        x: 0,
        z: FRIDGE_BOTTOM_CELL.z,
        layer: FRIDGE_BOTTOM_CELL.layer,
      },
      hinge: 1,
      slots: compartmentSlots(
        "fridge",
        "fridge_bottom",
        FRIDGE_BOTTOM_CELL,
        FRIDGE_BOTTOM_HEIGHT,
        ["fridge_bottom_rear", "fridge_bottom_front"],
      ),
    },
    {
      id: "fridge_top",
      compartment: FRIDGE_TOP_CELL,
      plate: { x: 0, z: FRIDGE_TOP_CELL.z, layer: FRIDGE_TOP_CELL.layer },
      hinge: 1,
      slots: compartmentSlots(
        "fridge",
        "fridge_top",
        FRIDGE_TOP_CELL,
        FRIDGE_TOP_HEIGHT,
        ["fridge_top_rear", "fridge_top_front"],
      ),
    },
  ],
  // The compartment block's height state lifts it onto the compartment floor.
  compartmentBlock: ({ face, open, height, end0, end1 }) => ({
    type: "fridge",
    face,
    height,
    open,
    ...(end0 === undefined ? {} : { end0 }),
    ...(end1 === undefined ? {} : { end1 }),
  }),
  plateBlock: ({ face, lit }) => ({ type: "fridgeDoor", face, lit }),
  // The namespace-free name of yasu_ride:camper_fridge_door; identifiers.test.ts checks it.
  plateBlockName: "camper_fridge_door",
};

// The units of storage with doors, in the order their doors swing and homeless saved decor
// fills them (ADR 0121).
export const CAMPER_STORAGE: readonly DooredStorage<
  StorageDoorId,
  StoragePairKind
>[] = [WALL_CABINET, FRIDGE];

const STORAGE_PAIR_KINDS: ReadonlySet<DecorPairKind> = new Set(
  CAMPER_STORAGE.map(({ pairKind }) => pairKind),
);

/** Whether `kind` is a storage compartment's, not a pair block's that decorCells lays (ADR 0108, 0121). */
export function isStoragePairKind(
  kind: DecorPairKind,
): kind is StoragePairKind {
  return STORAGE_PAIR_KINDS.has(kind);
}

/** Every storage door, unit by unit (ADR 0121). */
export const STORAGE_DOORS: readonly StorageDoor<StorageDoorId>[] =
  storageDoors(CAMPER_STORAGE);

// The two ceiling light panels hang over the aisle, one between the front seats and the
// dinette and one in front of the shower-toilet door, clear of the open cabinet doors at
// z -1 and -2 (tools/gen_camper.py CEILING_LIGHT_ZS). Each lights the cell under it, in
// layer 2 below the ceiling layer, which no furniture or decor slot fills. The open fridge top
// door's plate takes the front light's cell and gives its light (ADR 0115, 0123).
export const CEILING_LIGHTS: readonly LocalCell[] = [
  { x: 0, z: 1, layer: 2 },
  { x: 0, z: -3, layer: 2 },
];

const TABLE_CELL = { x: 1, z: 0, layer: 1 } as const satisfies LocalCell;

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
    spawn: { x: 0, z: -2, layer: 1 },
  },
  // The upper bunk over the bed: its own sleepable block with no collision, and its own aisle
  // spawn cell one further back (ADR 0182).
  {
    kind: "bunk",
    cells: [
      { x: 1, z: -2, layer: 2 },
      { x: 1, z: -3, layer: 2 },
    ],
    slots: [],
    block: { type: "bunk" },
    spawn: { x: 0, z: -3, layer: 1 },
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
  // Two items along each compartment, at the shelf boards' end spots, behind the
  // compartment's door. Storage is listed last, in CAMPER_STORAGE order, so that saved decor
  // that loses its slot fills every open spot before a closed compartment (ADR 0103, 0114, 0121).
  // Decor saved on the shelf boards the fridge replaced loads in the compartment in the same
  // place (decor.ts savedSlotId, ADR 0123).
  { kind: "wall_cabinet", ...storageFurniture(WALL_CABINET) },
  { kind: "fridge", ...storageFurniture(FRIDGE) },
];
