// The parked camper's room: its pose, its cells, and what may stand in them (ADR 0068).
import {
  forward,
  leftOf,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../../../shared/vec";
import { type DecorPlacement, decorFace } from "../../dock/decor";
import type { Box, ClearCell, DeckSeatSpot, Departure } from "../../dock/dock";
import type { DockBlock, DockCell, Face, HoldPose } from "../../dock/floor";
import { cellKey } from "../../lighting/headlights";
import { seatWorldPositions } from "../../seats";
import { DECOR_CELLS, decorInCell, decorSlot } from "./decor";
import {
  CAMPER_FURNITURE,
  DECOR_SPOTS,
  type DecorSlot,
  type FurnitureBlock,
  type LocalCell,
} from "./furniture";
import { CAMPER_PARKED_SEATS, CAMPER_PROFILE } from "./profile";

// Feet resting on a block top can read a hair below it.
const FEET_EPSILON = 0.01;
// Path, farmland, mud and soul sand tops need the floor in the next cell (ADR 0068).
const LOW_GROUND_THRESHOLD = 0.85;
const QUARTER_TURN = 90;
const PX_PER_BLOCK = 16;
// In cells from the center cell: x = left (-1..1), z = forward (-3..3), as in the
// spike (docs/spike-camper.md).
const HALF_X = 1;
const HALF_Z = 3;
const WALL_X = HALF_X + 1;
const WALL_Z = HALF_Z + 1;
// The door is in the middle of the right side; x is left, so the right side is -WALL_X.
const DOOR = { x: -WALL_X, z: 0 } as const;
// Furniture with a room block fills its cells, so they are neither open interior
// nor cargo (ADR 0092, 0093).
const FURNITURE_BLOCKS: readonly {
  readonly cell: LocalCell;
  readonly block: FurnitureBlock;
}[] = CAMPER_FURNITURE.filter(
  (f): f is typeof f & { readonly block: FurnitureBlock } =>
    f.block !== undefined,
).flatMap(({ cells, block }) => cells.map((cell) => ({ cell, block })));
// The ground cell just outside the door.
const EXIT = { x: -WALL_X - 1, z: 0 } as const;
const WALL_LAYERS = [1, 2, 3] as const;
// A plate at the top of the third layer leaves 2.81 blocks of headroom over the
// floor and puts the roof top 4.0 blocks up, flush with the fourth layer (ADR 0068).
const CEILING_LAYER = 3;
const INSIDE_LAYERS = [1, 2] as const;
const EXIT_LAYERS = [0, 1] as const;
const ROOF_LAYER = 4;
// A half step under the door, in pixels.
const DOOR_STEP_HEIGHT = 8;
// Feet heights above the pose of a player standing inside (the floor top is at 1)
// and on the roof (its top is at 4).
const INSIDE_FEET = [0.5, 3.5] as const;
const ROOF_FEET = [3.5, 6] as const;
// The interior's edge cells end half a block past their centers.
const STAND_HALF_X = HALF_X + 0.5;
const STAND_HALF_Z = HALF_Z + 0.5;
// The wall plates are 2 px thick on the room side of their cells, so the roof top
// ends 0.125 past the interior; half a player width (0.3) past that a player
// still stands on it.
const ROOF_HALF_X = STAND_HALF_X + 0.125 + 0.3;
const ROOF_HALF_Z = STAND_HALF_Z + 0.125 + 0.3;
// Each deck seat's height above the pose: the camper's minecraft:rideable seat
// height (1.5 in front, 1.2 at the dinette) minus the deck seat's own 0.52, so a
// rider sits where the vehicle seat would put them.
const DECK_SEAT_RISE = [0.98, 0.98, 0.68, 0.68] as const;
// The toilet seat is as high as the dinette seats, so the toilet's deck seat takes
// the dinette's rise (ADR 0095).
const TOILET_SEAT_RISE = 0.68;
// Deck seat i's rider stands up into the aisle cell (local x 0) beside that seat,
// on the floor: the front seats into the cell just behind them, each dinette seat
// into the cell beside it, and the toilet seat into the cell in front of the
// shower-toilet door (ADR 0109).
const DECK_SEAT_STAND_CELLS: readonly LocalCell[] = Object.freeze([
  { x: 0, z: 2, layer: 1 },
  { x: 0, z: 2, layer: 1 },
  { x: 0, z: 1, layer: 1 },
  { x: 0, z: -1, layer: 1 },
  { x: 0, z: -3, layer: 1 },
]);

export const AIR = "minecraft:air";
// The namespace-free name of yasu_ride:camper_furniture; identifiers.test.ts checks
// it against CAMPER_FURNITURE_BLOCK (ADR 0097).
const FURNITURE_BLOCK_SUFFIX = ":camper_furniture";
// yasu_ride:camper_furniture's height 0 is the hanging box under the hook,
// whatever the hanging slot's own height (ADR 0097, 0102).
const HANGING_FURNITURE_HEIGHT = 0;

/** Passable decorations that parking removes; anything else in a checked cell refuses (ADR 0068). */
export const CLEARABLE_DECORATIONS: ReadonlySet<string> = new Set([
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:deadbush",
  "minecraft:short_dry_grass",
  "minecraft:tall_dry_grass",
  "minecraft:bush",
  "minecraft:dandelion",
  "minecraft:poppy",
  "minecraft:blue_orchid",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:pink_tulip",
  "minecraft:oxeye_daisy",
  "minecraft:cornflower",
  "minecraft:lily_of_the_valley",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
  "minecraft:pink_petals",
  "minecraft:wildflowers",
  "minecraft:leaf_litter",
  "minecraft:snow_layer",
]);

/** Names of the driver's action bar messages (lang keys yasu_ride.message.<name>). */
export const PARK_MESSAGES = Object.freeze({
  cannotPark: "cannot_park",
  clearCargo: "clear_cargo",
});

export function snapYaw(yaw: number): number {
  // + 0 turns -0 into 0, so it never leaks into a pose.
  return normalizeYaw(Math.round(yaw / QUARTER_TURN) * QUARTER_TURN) + 0;
}

export function parkPose(location: Vec3, yaw: number): HoldPose {
  return {
    x: Math.floor(location.x) + 0.5,
    y:
      location.y >= Math.floor(location.y) + LOW_GROUND_THRESHOLD
        ? Math.ceil(location.y) + 0
        : Math.floor(location.y + FEET_EPSILON),
    z: Math.floor(location.z) + 0.5,
    yaw: snapYaw(yaw),
  };
}

// The snapped yaw's forward and left in whole cells: -1, 0, or 1 on each axis.
function axes(yaw: number): { f: Vec2; l: Vec2 } {
  const exact = forward(yaw);
  const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
  const l = leftOf(f);
  return { f, l: { x: l.x + 0, z: l.z + 0 } };
}

function cellAt(pose: HoldPose, lx: number, lz: number, dy: number): Vec3 {
  const { f, l } = axes(pose.yaw);
  return {
    x: Math.floor(pose.x) + lx * l.x + lz * f.x + 0,
    y: pose.y + dy,
    z: Math.floor(pose.z) + lx * l.z + lz * f.z + 0,
  };
}

/** The world cell of a decor slot at a parked pose (ADR 0093). */
export function decorSlotCell(pose: HoldPose, slot: DecorSlot): Vec3 {
  return cellAt(pose, slot.cell.x, slot.cell.z, slot.cell.layer);
}

/**
 * The world offset in blocks from a cell's middle to the decor spot `spot` (an index in
 * DECOR_SPOTS) at a snapped `yaw`: a decor block's yasu_ride:spot translation (ADR 0107).
 */
export function decorSpotOffset(yaw: number, spot: number): Vec2 {
  const { left, forward } = DECOR_SPOTS[spot] ?? { left: 0, forward: 0 };
  const { f, l } = axes(yaw);
  return {
    x: (left * l.x + forward * f.x) / PX_PER_BLOCK + 0,
    z: (left * l.z + forward * f.z) / PX_PER_BLOCK + 0,
  };
}

// The side of a wall cell that faces the room, from the unit vector toward it.
function faceToward(v: Vec2): Face {
  if (v.z !== 0) return v.z < 0 ? 0 : 1;
  return v.x < 0 ? 2 : 3;
}

// The aisle is local x 0, so a furniture block at x -1 or 1 faces it along -x times left.
function laidFurnitureBlock(
  block: FurnitureBlock,
  cell: LocalCell,
  l: Vec2,
): DockBlock {
  if (block.type !== "showerToilet") return block;
  return {
    type: "showerToilet",
    face: faceToward({ x: -cell.x * l.x, z: -cell.x * l.z }),
  };
}

function holdsFurnitureBlock(lx: number, lz: number, dy: number): boolean {
  return FURNITURE_BLOCKS.some(
    ({ cell }) => cell.x === lx && cell.z === lz && cell.layer === dy,
  );
}

/** The interior cells at `layers` that no furniture block fills. */
function interior(pose: HoldPose, layers: readonly number[]): Vec3[] {
  const cells: Vec3[] = [];
  for (const dy of layers)
    for (let lx = -HALF_X; lx <= HALF_X; lx++)
      for (let lz = -HALF_Z; lz <= HALF_Z; lz++)
        if (!holdsFurnitureBlock(lx, lz, dy))
          cells.push(cellAt(pose, lx, lz, dy));
  return cells;
}

/** The 107 cells of the parked room: its shell, the door step, and every furniture block (ADR 0068, 0092, 0093, 0098). */
export function roomCells(pose: HoldPose, doorOpen: boolean): DockCell[] {
  const { f, l } = axes(pose.yaw);
  const cells: DockCell[] = [
    ...interior(pose, [0]).map((at) => ({
      ...at,
      block: { type: "floor" } as const,
    })),
    ...interior(pose, [CEILING_LAYER]).map((at) => ({
      ...at,
      block: { type: "ceiling" } as const,
    })),
  ];
  for (const side of [-1, 1]) {
    const lx = side * WALL_X;
    const face = faceToward({ x: -side * l.x, z: -side * l.z });
    for (let lz = -HALF_Z; lz <= HALF_Z; lz++)
      for (const dy of WALL_LAYERS) {
        const door = lx === DOOR.x && lz === DOOR.z;
        cells.push({
          ...cellAt(pose, lx, lz, dy),
          block: door
            ? { type: "door", face, open: doorOpen }
            : { type: "wall", face },
        });
      }
  }
  for (const end of [-1, 1]) {
    const face = faceToward({ x: -end * f.x, z: -end * f.z });
    for (let lx = -HALF_X; lx <= HALF_X; lx++)
      for (const dy of WALL_LAYERS)
        cells.push({
          ...cellAt(pose, lx, end * WALL_Z, dy),
          block: { type: "wall", face },
        });
  }
  cells.push({
    ...cellAt(pose, DOOR.x, DOOR.z, 0),
    block: { type: "deck", height: DOOR_STEP_HEIGHT },
  });
  for (const { cell, block } of FURNITURE_BLOCKS)
    cells.push({
      ...cellAt(pose, cell.x, cell.z, cell.layer),
      block: laidFurnitureBlock(block, cell, l),
    });
  return cells;
}

type DecorCell = DockCell & {
  readonly block: Extract<DockBlock, { type: "decor" | "decorPair" }>;
};

/** The item at each end of the pair cell that holds `slot`, by DecorPairEnd.end (ADR 0108). */
function pairItems(
  slot: DecorSlot,
  decor: readonly DecorPlacement[],
): { end0?: string; end1?: string } {
  const itemAt = (end: 0 | 1) =>
    decor.find((d) => {
      const s = decorSlot(d.slot);
      return (
        s?.pair?.end === end &&
        s.cell.x === slot.cell.x &&
        s.cell.z === slot.cell.z &&
        s.cell.layer === slot.cell.layer
      );
    })?.item;
  const end0 = itemAt(0);
  const end1 = itemAt(1);
  return {
    ...(end0 === undefined ? {} : { end0 }),
    ...(end1 === undefined ? {} : { end1 }),
  };
}

/**
 * One block per slot cell that holds a placement in a known slot, turned to the yaw quarter.
 * On a shelf board or the table it is the pair block with the item at each end (ADR 0108);
 * elsewhere a decor block at the slot's height and spot, and since a cell holds one block,
 * the first placement in a cell wins (ADR 0093, 0105).
 */
export function decorCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): DecorCell[] {
  const face = decorFace(pose.yaw);
  const laid = new Set<string>();
  return decor.flatMap(({ slot, item }) => {
    const s = decorSlot(slot);
    if (!s) return [];
    const at = decorSlotCell(pose, s);
    const key = cellKey(at);
    if (laid.has(key)) return [];
    laid.add(key);
    const block: DecorCell["block"] = s.pair
      ? {
          type: "decorPair",
          pair: s.pair.kind,
          face,
          height: s.height,
          ...pairItems(s, decor),
        }
      : { type: "decor", item, face, height: s.height, spot: s.spot ?? 0 };
    return [{ ...at, block }];
  });
}

type FurnitureCell = DockCell & {
  readonly block: Extract<DockBlock, { type: "furniture" }>;
};

/**
 * A furniture block in every slot cell that holds no decor, at the height of the cell's first
 * slot, or the hanging box for a hanging slot, in DECOR_CELLS order (ADR 0097, 0102, 0105).
 */
export function furnitureCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): FurnitureCell[] {
  return DECOR_CELLS.filter(({ cell }) => !decorInCell(cell, decor)).map(
    ({ cell, slots }) => {
      const first = slots[0];
      return {
        ...cellAt(pose, cell.x, cell.z, cell.layer),
        block: {
          type: "furniture",
          height:
            first === undefined || first.hanging
              ? HANGING_FURNITURE_HEIGHT
              : first.height,
        } as const,
      };
    },
  );
}

/** Every slot cell once, in DECOR_CELLS order (ADR 0097, 0105). */
export function slotCells(pose: HoldPose): Vec3[] {
  return DECOR_CELLS.map(({ cell }) =>
    cellAt(pose, cell.x, cell.z, cell.layer),
  );
}

/**
 * The namespace-free name of the block the decor in `cell` lays: the pair block of a shelf
 * board or the table, or the decor block of the cell's item; undefined while the cell holds
 * no decor (ADR 0093, 0108).
 */
export function decorBlockName(
  cell: LocalCell,
  decor: readonly DecorPlacement[],
): string | undefined {
  const placed = decorInCell(cell, decor);
  const slot = placed && decorSlot(placed.slot);
  if (!placed || !slot) return undefined;
  return slot.pair ? `${slot.pair.kind}_decor_pair` : `${placed.item}_decor`;
}

/**
 * A slot cell lets the camper leave only while it holds air, the furniture block, or
 * `decorBlock`, the block its decor lays (decorBlockName; undefined for an empty cell)
 * (ADR 0093, 0097, 0108).
 */
export function ownSlotBlock(
  typeId: string | undefined,
  decorBlock: string | undefined,
): boolean {
  // An occupied slot may still hold its furniture block: decor placed this tick
  // is laid only on the next step.
  if (typeId === AIR || typeId?.endsWith(FURNITURE_BLOCK_SUFFIX) === true)
    return true;
  return (
    decorBlock !== undefined && typeId?.endsWith(`:${decorBlock}`) === true
  );
}

/**
 * The 168 parking checks include standing space and the exit because the long
 * body reaches past its collision box and can stop around a flower or low block.
 */
export function parkCheckCells(pose: HoldPose): Vec3[] {
  return [
    ...roomCells(pose, false).map(({ x, y, z }) => ({ x, y, z })),
    ...cargoCells(pose),
    ...slotCells(pose),
    ...exitCells(pose),
  ];
}

/**
 * The feet and head cells of a player moved to the exit: on the ground beside
 * the door step, so at the floor's layer and the one above it.
 */
export function exitCells(pose: HoldPose): Vec3[] {
  return EXIT_LAYERS.map((layer) => cellAt(pose, EXIT.x, EXIT.z, layer));
}

export function isPassable(typeId: string | undefined): boolean {
  return (
    typeId === AIR ||
    (typeId !== undefined && CLEARABLE_DECORATIONS.has(typeId))
  );
}

/**
 * Cells where a player's block keeps the camper parked: the interior outside
 * furniture blocks and decor slots, then the roof top (ADR 0092, 0093, 0097).
 * Slot cells are read separately, with ownSlotBlock.
 */
export function cargoCells(pose: HoldPose): Vec3[] {
  const slots = new Set(slotCells(pose).map(cellKey));
  return interior(pose, [...INSIDE_LAYERS, ROOF_LAYER]).filter(
    (c) => !slots.has(cellKey(c)),
  );
}

/** Layer-zero wall roots are read for matching plants, never to refuse parking. */
export function wallFootCells(pose: HoldPose): Vec3[] {
  return roomCells(pose, false)
    .filter((c) => c.block.type === "wall" && c.y === pose.y + 1)
    .map(({ x, y, z }) => ({ x, y: y - 1, z }));
}

/** The decorations to remove, top layer first, or undefined when any cell refuses parking. */
export function planPark(
  cells: readonly Vec3[],
  types: readonly (string | undefined)[],
  feet: readonly Vec3[] = [],
  footTypes: readonly (string | undefined)[] = [],
): ClearCell[] | undefined {
  if (cells.some((_, i) => !isPassable(types[i]))) return undefined;
  return parkDecorations(cells, types, feet, footTypes);
}

/** Clears only decorations even if a restored unlaid room now has a blocking cell. */
export function parkDecorations(
  cells: readonly Vec3[],
  types: readonly (string | undefined)[],
  feet: readonly Vec3[],
  footTypes: readonly (string | undefined)[],
): ClearCell[] {
  const clear: ClearCell[] = [];
  for (const [i, cell] of cells.entries()) {
    const typeId = types[i];
    if (typeId !== undefined && CLEARABLE_DECORATIONS.has(typeId))
      clear.push({ ...cell, typeId });
  }
  const upperTypes = new Map(clear.map((c) => [cellKey(c), c.typeId]));
  for (const [i, cell] of feet.entries()) {
    const typeId = footTypes[i];
    if (
      typeId !== undefined &&
      upperTypes.get(cellKey({ ...cell, y: cell.y + 1 })) === typeId
    )
      clear.push({ ...cell, typeId });
  }
  // Removing the lower half of a tall plant first would drop its upper half as an item.
  return clear.sort((a, b) => b.y - a.y);
}

/** Unknown cells (an unloaded chunk) count as holding a block. */
export function holdsCargo(types: readonly (string | undefined)[]): boolean {
  return types.some((t) => t !== AIR);
}

function standingBox(
  pose: HoldPose,
  [low, high]: readonly [number, number],
  halfX = STAND_HALF_X,
  halfZ = STAND_HALF_Z,
): Box {
  const { f, l } = axes(pose.yaw);
  const hx = Math.abs(f.x) * halfZ + Math.abs(l.x) * halfX;
  const hz = Math.abs(f.z) * halfZ + Math.abs(l.z) * halfX;
  return {
    min: { x: pose.x - hx, y: pose.y + low, z: pose.z - hz },
    max: { x: pose.x + hx, y: pose.y + high, z: pose.z + hz },
  };
}

export function departure(pose: HoldPose, exitClear = true): Departure {
  const exit = cellAt(pose, EXIT.x, EXIT.z, 0);
  return {
    boxes: [
      standingBox(pose, INSIDE_FEET),
      standingBox(pose, ROOF_FEET, ROOF_HALF_X, ROOF_HALF_Z),
    ],
    // Facing away from the body: the camper's right is its yaw plus a quarter turn.
    exit: exitClear
      ? {
          x: exit.x + 0.5,
          y: pose.y,
          z: exit.z + 0.5,
          yaw: normalizeYaw(pose.yaw + QUARTER_TURN),
        }
      : undefined,
  };
}

function vehicleDeckSeats(pose: HoldPose): Vec3[] {
  return seatWorldPositions(pose, CAMPER_PROFILE.seats.positions).map(
    (at, i) => ({ ...at, y: at.y + (DECK_SEAT_RISE[i] ?? 0) }),
  );
}

/** The middle of a local cell's bottom: where a player standing in it has their feet. */
function standPoint(pose: HoldPose, cell: LocalCell): Vec3 {
  const at = cellAt(pose, cell.x, cell.z, cell.layer);
  return { x: at.x + 0.5, y: at.y, z: at.z + 0.5 };
}

/**
 * A deck seat at each profile seat, then the compact toilet seat, each with the
 * aisle spot its rider stands up to (ADR 0068, 0095, 0109).
 */
export function deckSeats(pose: HoldPose): DeckSeatSpot[] {
  const toilet = seatWorldPositions(pose, CAMPER_PARKED_SEATS.positions).map(
    (at) => ({ ...at, y: at.y + TOILET_SEAT_RISE, compact: true }),
  );
  const stands = DECK_SEAT_STAND_CELLS.map((cell) => standPoint(pose, cell));
  return [...vehicleDeckSeats(pose), ...toilet].map((at, i) => ({
    ...at,
    stand: stands[i],
  }));
}
