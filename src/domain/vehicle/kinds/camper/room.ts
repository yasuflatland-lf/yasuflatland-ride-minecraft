// The parked camper's room: its pose, its cells, and what may stand in them (ADR 0068).
import {
  forward,
  leftOf,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../../../shared/vec";
import { type DecorPlacement, decorFace } from "../../dock/decor";
import type { Box, ClearCell, Departure } from "../../dock/dock";
import type { DockBlock, DockCell, Face, HoldPose } from "../../dock/floor";
import { cellKey } from "../../lighting/headlights";
import { seatWorldPositions } from "../../seats";
import { decorSlot } from "./decor";
import { CAMPER_FURNITURE, type DecorSlot, type LocalCell } from "./furniture";
import { CAMPER_PROFILE } from "./profile";

// Feet resting on a block top can read a hair below it.
const FEET_EPSILON = 0.01;
// Path, farmland, mud and soul sand tops need the floor in the next cell (ADR 0068).
const LOW_GROUND_THRESHOLD = 0.85;
const QUARTER_TURN = 90;
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
  readonly block: DockBlock;
}[] = CAMPER_FURNITURE.flatMap(({ cells, block }) =>
  block === undefined ? [] : cells.map((cell) => ({ cell, block })),
);
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

export const AIR = "minecraft:air";

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

// The shower-toilet's column; a tap on its floor cell opens its door or runs the shower (ADR 0094).
const SHOWER_COLUMN = (() => {
  const cell = CAMPER_FURNITURE.find((f) => f.kind === "shower_toilet")
    ?.cells[0];
  if (!cell) throw new Error("CAMPER_FURNITURE has no shower_toilet cell");
  return { x: cell.x, z: cell.z };
})();

/** The floor cell under the shower-toilet (ADR 0094). */
export function showerFloorCell(pose: HoldPose): Vec3 {
  return cellAt(pose, SHOWER_COLUMN.x, SHOWER_COLUMN.z, 0);
}

/** The world cell of a decor slot at a parked pose (ADR 0093). */
export function decorSlotCell(pose: HoldPose, slot: DecorSlot): Vec3 {
  return cellAt(pose, slot.cell.x, slot.cell.z, slot.cell.layer);
}

// The side of a wall cell that faces the room, from the unit vector toward it.
function faceToward(v: Vec2): Face {
  if (v.z !== 0) return v.z < 0 ? 0 : 1;
  return v.x < 0 ? 2 : 3;
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

/** The 105 cells of the parked room: its shell, the door step, and every furniture block (ADR 0068, 0092, 0093). */
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
    cells.push({ ...cellAt(pose, cell.x, cell.z, cell.layer), block });
  return cells;
}

/** One decor block per placement in a known slot, at the slot's cell and height, turned to the yaw quarter (ADR 0093). */
export function decorCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): DockCell[] {
  const face = decorFace(pose.yaw);
  return decor.flatMap(({ slot, item }) => {
    const s = decorSlot(slot);
    return s
      ? [
          {
            ...decorSlotCell(pose, s),
            block: { type: "decor", item, face, height: s.height } as const,
          },
        ]
      : [];
  });
}

/** A decor cell lets the camper leave only while it holds air or that slot's own decor block (ADR 0093). */
export function ownDecor(typeId: string | undefined, item: string): boolean {
  return typeId === AIR || typeId?.endsWith(`:${item}_decor`) === true;
}

/**
 * The 168 parking checks include standing space and the exit because the long
 * body reaches past its collision box and can stop around a flower or low block.
 */
export function parkCheckCells(pose: HoldPose): Vec3[] {
  return [
    ...roomCells(pose, false).map(({ x, y, z }) => ({ x, y, z })),
    ...cargoCells(pose),
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
 * furniture blocks, then the roof top (ADR 0092, 0093). Decor cells are read
 * separately, with ownDecor (ADR 0093).
 */
export function cargoCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[] = [],
): Vec3[] {
  const decorKeys = new Set(decorCells(pose, decor).map(cellKey));
  return interior(pose, [...INSIDE_LAYERS, ROOF_LAYER]).filter(
    (c) => !decorKeys.has(cellKey(c)),
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

export function deckSeats(pose: HoldPose): Vec3[] {
  return seatWorldPositions(pose, CAMPER_PROFILE.seats.positions).map(
    (at, i) => ({ ...at, y: at.y + (DECK_SEAT_RISE[i] ?? 0) }),
  );
}
