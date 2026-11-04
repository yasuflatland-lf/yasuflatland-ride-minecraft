import { cellKey } from "../../../shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../shared/decorations";
import type { Vec3 } from "../../../shared/vec";
import type { ClearCell } from "../../dock/dock";
import type { HoldPose } from "../../dock/floor";
import { slotCells } from "./decorCells";
import type { StorageDoor } from "./dooredStorage";
import { STORAGE_DOORS } from "./furniture";
import { cellAt } from "./parkPose";
import { EXIT_LAYERS, exitCells, roomCells } from "./roomCells";
import { AIR, EXIT, HALF_X, WALL_Z } from "./roomGeometry";
import { cargoCells, storagePlateChecks } from "./storagePlates";

/**
 * Full natural ground blocks: one rising into a floor or door step cell has its top flush
 * with the floor, so it stays there as floor (ADR 0119).
 */
export const NATURAL_GROUND: ReadonlySet<string> = new Set([
  "minecraft:grass_block",
  "minecraft:dirt",
  "minecraft:coarse_dirt",
  "minecraft:podzol",
  "minecraft:mycelium",
  "minecraft:dirt_with_roots",
  "minecraft:moss_block",
  "minecraft:pale_moss_block",
]);

/** Names of the driver's action bar messages (lang keys yasu_ride.message.<name>). */
export const PARK_MESSAGES = Object.freeze({
  cannotPark: "cannot_park",
  clearCargo: "clear_cargo",
});

/**
 * The 168 parking checks include standing space and the exit because the long
 * body reaches past its collision box and can stop around a flower or low block.
 * Storage plates in the inside layers add their cells; the wall cabinet has none (ADR 0121).
 */
export function parkCheckCells(
  pose: HoldPose,
  doors: readonly StorageDoor[] = STORAGE_DOORS,
): Vec3[] {
  return [
    ...roomCells(pose, false).map(({ x, y, z }) => ({ x, y, z })),
    ...cargoCells(pose, doors),
    ...slotCells(pose),
    ...storagePlateChecks(pose, doors).map(({ cell }) => cell),
    ...exitCells(pose),
  ];
}

export function isPassable(typeId: string | undefined): boolean {
  return (
    typeId === AIR ||
    (typeId !== undefined && CLEARABLE_DECORATIONS.has(typeId))
  );
}

/** The ground-layer cells under the front end wall: the bumper's row (ADR 0116, 0119). */
function bumperCells(pose: HoldPose): Vec3[] {
  const cells: Vec3[] = [];
  for (let lx = -HALF_X; lx <= HALF_X; lx++)
    cells.push(cellAt(pose, lx, WALL_Z, 0));
  return cells;
}

/**
 * Where parking accepts more than air and plants, by cell key (ADR 0119): `ground` holds the
 * floor cells, the door step and the exit's feet, where natural ground may rise, and `bumper`
 * the wall feet in the bumper's row, whose plants are cleared even without an upper half.
 */
interface ParkGround {
  readonly ground: ReadonlySet<string>;
  readonly bumper: ReadonlySet<string>;
}

const NO_PARK_GROUND: ParkGround = { ground: new Set(), bumper: new Set() };

export function parkGround(pose: HoldPose): ParkGround {
  const ground = roomCells(pose, false)
    .filter((c) => c.y === pose.y)
    .map(cellKey);
  const exitFeet = cellAt(pose, EXIT.x, EXIT.z, EXIT_LAYERS[0]);
  return {
    ground: new Set([...ground, cellKey(exitFeet)]),
    bumper: new Set(bumperCells(pose).map(cellKey)),
  };
}

function isNaturalGround(typeId: string | undefined): boolean {
  return typeId !== undefined && NATURAL_GROUND.has(typeId);
}

/** Layer-zero wall roots are read for matching plants, never to refuse parking. */
export function wallFootCells(pose: HoldPose): Vec3[] {
  return roomCells(pose, false)
    .filter((c) => c.block.type === "wall" && c.y === pose.y + 1)
    .map(({ x, y, z }) => ({ x, y: y - 1, z }));
}

/**
 * The decorations to remove, top layer first, or undefined when any cell refuses parking.
 * Natural ground in a `ground` cell is left as it is: the dock lays no block over it
 * (ADR 0119).
 */
export function planPark(
  cells: readonly Vec3[],
  types: readonly (string | undefined)[],
  feet: readonly Vec3[] = [],
  footTypes: readonly (string | undefined)[] = [],
  spots: ParkGround = NO_PARK_GROUND,
): ClearCell[] | undefined {
  const refuses = (cell: Vec3, typeId: string | undefined) =>
    !isPassable(typeId) &&
    !(isNaturalGround(typeId) && spots.ground.has(cellKey(cell)));
  if (cells.some((cell, i) => refuses(cell, types[i]))) return undefined;
  return parkDecorations(cells, types, feet, footTypes, spots);
}

/** Clears only decorations even if a restored unlaid room now has a blocking cell. */
export function parkDecorations(
  cells: readonly Vec3[],
  types: readonly (string | undefined)[],
  feet: readonly Vec3[],
  footTypes: readonly (string | undefined)[],
  spots: ParkGround = NO_PARK_GROUND,
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
    if (typeId === undefined) continue;
    // A plant in the bumper's row would take the taps meant for the stand-in (ADR 0119).
    const bumperPlant =
      CLEARABLE_DECORATIONS.has(typeId) && spots.bumper.has(cellKey(cell));
    if (
      bumperPlant ||
      upperTypes.get(cellKey({ ...cell, y: cell.y + 1 })) === typeId
    )
      clear.push({ ...cell, typeId });
  }
  // Removing the lower half of a tall plant first would drop its upper half as an item.
  return clear.sort((a, b) => b.y - a.y);
}
