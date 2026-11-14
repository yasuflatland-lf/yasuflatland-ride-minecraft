// The parked camper's room: its pose, its cells, and what may stand in them (ADR 0068).
import { normalizeYaw, type Vec2, type Vec3 } from "../../../shared/vec";
import {
  type DeckSeatSpot,
  type Departure,
  inBox,
  type WorldBox,
} from "../../dock/dock";
import type { DockBlock, DockCell, HoldPose } from "../../dock/floor";
import { seatWorldPositions } from "../../seats";
import {
  compartmentDoorAt,
  openPlateAt,
  type StorageDoor,
} from "./dooredStorage";
import {
  CAMPER_FURNITURE,
  CEILING_LIGHTS,
  type FurnitureBlock,
  type LocalCell,
  SLEEP_BLOCKS,
  STORAGE_DOORS,
} from "./furniture";
import { axes, cellAt, localCellAt, QUARTER_TURN } from "./parkPose";
import { CAMPER_PARKED_SEATS, CAMPER_PROFILE } from "./profile";
import {
  CEILING_LAYER,
  DOOR,
  EXIT,
  FURNITURE_BLOCKS,
  faceToward,
  HALF_X,
  HALF_Z,
  interior,
  localInterior,
  NO_DOORS,
  WALL_X,
  WALL_Z,
} from "./roomGeometry";
import { plateFace } from "./storagePlates";

// The open shower door stands in the aisle cell (0, -3) just in front of this rear wall
// cell, whose plate then takes the taps that pass through the door's model (ADR 0118).
const SHOWER_DOOR_WALL = { x: 0, z: -WALL_Z } as const;

const WALL_LAYERS = [1, 2, 3] as const;

export const EXIT_LAYERS = [0, 1] as const;

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

/**
 * The ceiling cell's block: none over a storage compartment, whose block also holds the
 * ceiling up (compartmentCells), and an open door's plate where that door swings into the
 * aisle (ADR 0068, 0114, 0121).
 */
function ceilingBlock(
  cell: LocalCell,
  f: Vec2,
  open: ReadonlySet<string>,
  doors: readonly StorageDoor[],
): DockBlock | undefined {
  if (compartmentDoorAt(cell, doors)) return undefined;
  const door = openPlateAt(cell, open, doors);
  if (!door) return { type: "ceiling" };
  // No ceiling light hangs in the ceiling layer: its light cells are the ones under it.
  return door.unit.plateBlock({ face: plateFace(door.opening, f), lit: false });
}

/**
 * The 105 cells of the parked room: its shell, the door step, and every furniture block. The
 * two wall cabinet cells under the ceiling are laid by compartmentCells, an open storage
 * door's aisle cell under the ceiling holds its plate instead of the ceiling, and the rear wall
 * behind the open shower door is selectable (ADR 0068, 0092, 0093, 0098, 0114, 0118, 0121).
 */
export function roomCells(
  pose: HoldPose,
  doorOpen: boolean,
  openStorage: ReadonlySet<string> = NO_DOORS,
  showerDoorOpen = false,
  doors: readonly StorageDoor[] = STORAGE_DOORS,
): DockCell[] {
  const { f, l } = axes(pose.yaw);
  const ceiling = localInterior([CEILING_LAYER]).flatMap((cell) => {
    const block = ceilingBlock(cell, f, openStorage, doors);
    return block ? [{ ...localCellAt(pose, cell), block }] : [];
  });
  const cells: DockCell[] = [
    ...interior(pose, [0]).map((at) => ({
      ...at,
      block: { type: "floor" } as const,
    })),
    ...ceiling,
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
      for (const dy of WALL_LAYERS) {
        const behindShowerDoor =
          showerDoorOpen &&
          lx === SHOWER_DOOR_WALL.x &&
          end * WALL_Z === SHOWER_DOOR_WALL.z;
        cells.push({
          ...cellAt(pose, lx, end * WALL_Z, dy),
          block: { type: behindShowerDoor ? "showerDoor" : "wall", face },
        });
      }
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

/**
 * The feet and head cells of a player moved to the exit: on the ground beside
 * the door step, so at the floor's layer and the one above it.
 */
export function exitCells(pose: HoldPose): Vec3[] {
  return EXIT_LAYERS.map((layer) => cellAt(pose, EXIT.x, EXIT.z, layer));
}

function standingBox(
  pose: HoldPose,
  [low, high]: readonly [number, number],
  halfX = STAND_HALF_X,
  halfZ = STAND_HALF_Z,
): WorldBox {
  const { f, l } = axes(pose.yaw);
  const hx = Math.abs(f.x) * halfZ + Math.abs(l.x) * halfX;
  const hz = Math.abs(f.z) * halfZ + Math.abs(l.z) * halfX;
  return {
    min: { x: pose.x - hx, y: pose.y + low, z: pose.z - hz },
    max: { x: pose.x + hx, y: pose.y + high, z: pose.z + hz },
  };
}

/** Whether a player with feet at `feet` is inside the parked room, standing or seated (ADR 0115). */
export function insideRoom(pose: HoldPose, feet: Vec3): boolean {
  return inBox(standingBox(pose, INSIDE_FEET), feet);
}

/** The world cell a press on bed block `cell` of a camper parked at `pose` respawns the player in; undefined when `cell` is no sleepable cell (ADR 0182). */
export function bedSpawnCell(pose: HoldPose, cell: Vec3): Vec3 | undefined {
  const pressed = CAMPER_FURNITURE.find(
    ({ block, cells }) =>
      block !== undefined &&
      SLEEP_BLOCKS.has(block.type) &&
      cells.some((c) => {
        const at = localCellAt(pose, c);
        return at.x === cell.x && at.y === cell.y && at.z === cell.z;
      }),
  );
  if (pressed === undefined) return undefined;
  return pressed.spawn === undefined ? cell : localCellAt(pose, pressed.spawn);
}

/** Whether a player with feet at `feet` stands in the shower-toilet's column (ADR 0098, 0118). */
export function inShowerToilet(pose: HoldPose, feet: Vec3): boolean {
  return FURNITURE_BLOCKS.some(({ cell, block }) => {
    if (block.type !== "showerToilet") return false;
    const at = localCellAt(pose, cell);
    return Math.floor(feet.x) === at.x && Math.floor(feet.z) === at.z;
  });
}

/**
 * A light block in the cell under each ceiling light that no open storage door's plate takes
 * (ADR 0115, 0121).
 */
export function ceilingLightCells(
  pose: HoldPose,
  open: ReadonlySet<string> = NO_DOORS,
  doors: readonly StorageDoor[] = STORAGE_DOORS,
): DockCell[] {
  return CEILING_LIGHTS.filter((cell) => !openPlateAt(cell, open, doors)).map(
    (cell) => ({
      ...localCellAt(pose, cell),
      block: { type: "light" } as const,
    }),
  );
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
