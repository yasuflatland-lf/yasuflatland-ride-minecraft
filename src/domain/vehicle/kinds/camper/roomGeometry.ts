import type { Vec2, Vec3 } from "../../../shared/vec";
import type { Face, HoldPose } from "../../dock/floor";
import {
  CAMPER_FURNITURE,
  type FurnitureBlock,
  type LocalCell,
} from "./furniture";
import { localCellAt } from "./parkPose";

// In cells from the center cell: x = left (-1..1), z = forward (-3..3), as in the
// spike (docs/spikes/camper.md).
export const HALF_X = 1;

export const HALF_Z = 3;

export const WALL_X = HALF_X + 1;

export const WALL_Z = HALF_Z + 1;

// The door is in the middle of the right side; x is left, so the right side is -WALL_X.
export const DOOR = { x: -WALL_X, z: 0 } as const;

// Furniture with a room block fills its cells, so they are neither open interior
// nor cargo (ADR 0092, 0093).
export const FURNITURE_BLOCKS: readonly {
  readonly cell: LocalCell;
  readonly block: FurnitureBlock;
}[] = CAMPER_FURNITURE.filter(
  (f): f is typeof f & { readonly block: FurnitureBlock } =>
    f.block !== undefined,
).flatMap(({ cells, block }) => cells.map((cell) => ({ cell, block })));

// The ground cell just outside the door.
export const EXIT = { x: -WALL_X - 1, z: 0 } as const;

// A plate at the top of the third layer leaves 2.81 blocks of headroom over the
// floor and puts the roof top 4.0 blocks up, flush with the fourth layer (ADR 0068).
export const CEILING_LAYER = 3;

export const INSIDE_LAYERS = [1, 2] as const;

export const ROOF_LAYER = 4;

export const AIR = "minecraft:air";

export const NO_DOORS: ReadonlySet<string> = new Set();

// The side of a wall cell that faces the room, from the unit vector toward it.
export function faceToward(v: Vec2): Face {
  if (v.z !== 0) return v.z < 0 ? 0 : 1;
  return v.x < 0 ? 2 : 3;
}

function holdsFurnitureBlock(lx: number, lz: number, dy: number): boolean {
  return FURNITURE_BLOCKS.some(
    ({ cell }) => cell.x === lx && cell.z === lz && cell.layer === dy,
  );
}

/** The local interior cells at `layers` that no furniture block fills. */
export function localInterior(layers: readonly number[]): LocalCell[] {
  const cells: LocalCell[] = [];
  for (const layer of layers)
    for (let x = -HALF_X; x <= HALF_X; x++)
      for (let z = -HALF_Z; z <= HALF_Z; z++) cells.push({ x, z, layer });
  return cells.filter(({ x, z, layer }) => !holdsFurnitureBlock(x, z, layer));
}

/** The interior cells at `layers` that no furniture block fills. */
export function interior(pose: HoldPose, layers: readonly number[]): Vec3[] {
  return localInterior(layers).map((cell) => localCellAt(pose, cell));
}
