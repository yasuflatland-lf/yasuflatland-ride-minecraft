import { type Cell, cellOf } from "../shared/cells";
import { type Facing4, snapYaw4 } from "../shared/facing";
import type { TopSurface } from "../shared/tableTop";
import { forward, localOffset, type Vec2, type Vec3 } from "../shared/vec";

export type FurnitureKind =
  | "dining_table"
  | "dining_chair"
  | "sofa_single"
  | "sofa_double";

/** A cell relative to the pressed column, seen by the placing player: `ahead` is away from them, `left` to their left. */
export interface CellOffset {
  readonly ahead: number;
  readonly left: number;
}

/** A seat relative to the entity origin, in blocks; must match the pack's `minecraft:rideable` seats. */
export interface SeatOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FurnitureSpec {
  /** The pressed column is `{ ahead: 0, left: 0 }`. */
  readonly cells: readonly CellOffset[];
  /** Layers of air needed above each support cell. */
  readonly clearance: number;
  readonly seats: readonly SeatOffset[];
  readonly hitsToTakeBack: number;
  readonly hitResetTicks: number;
  /** Only furniture that hosts lanterns and ovens has a top. */
  readonly top?: TopSurface;
}

// Initial values; each piece's issue settles them against its model (ADR 0240).
export const FURNITURE_SPEC: Readonly<Record<FurnitureKind, FurnitureSpec>> =
  Object.freeze({
    dining_table: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([]),
      hitsToTakeBack: 3,
      hitResetTicks: 100,
      top: Object.freeze({
        half: Object.freeze({ halfX: 0.4, halfZ: 0.4 }),
        topPx: 12,
        limit: 4,
        clearanceBase: 0,
      }),
    }),
    dining_chair: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([Object.freeze({ x: 0, y: 0.45, z: 0.05 })]),
      hitsToTakeBack: 3,
      hitResetTicks: 100,
    }),
    sofa_single: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([Object.freeze({ x: 0, y: 0.4, z: 0.05 })]),
      hitsToTakeBack: 3,
      hitResetTicks: 100,
    }),
    sofa_double: Object.freeze({
      cells: Object.freeze([
        Object.freeze({ ahead: 0, left: 0 }),
        Object.freeze({ ahead: 0, left: -1 }),
      ]),
      clearance: 2,
      seats: Object.freeze([
        Object.freeze({ x: -0.5, y: 0.4, z: 0.05 }),
        Object.freeze({ x: 0.5, y: 0.4, z: 0.05 }),
      ]),
      hitsToTakeBack: 3,
      hitResetTicks: 100,
    }),
  });

export interface FurniturePose {
  readonly kind: FurnitureKind;
  readonly origin: Vec3;
  readonly yaw: Facing4;
}

function footprintOffsets(kind: FurnitureKind, yaw: Facing4): Vec2[] {
  // The furniture faces the player, so the player looks along the opposite quarter turn.
  const playerFacing = forward(yaw + 180);
  return FURNITURE_SPEC[kind].cells.map(({ ahead, left }) => {
    const offset = localOffset(playerFacing, ahead, -left);
    return { x: Math.round(offset.x), z: Math.round(offset.z) };
  });
}

function offsetCentre(offsets: readonly Vec2[]): Vec2 {
  return {
    x: offsets.reduce((sum, offset) => sum + offset.x, 0) / offsets.length,
    z: offsets.reduce((sum, offset) => sum + offset.z, 0) / offsets.length,
  };
}

/** `block` is the block whose top face was used; the pressed column's floor cell is one above it. */
export function furniturePose(
  block: Cell,
  playerYaw: number,
  kind: FurnitureKind,
): FurniturePose {
  const yaw = snapYaw4(playerYaw + 180);
  const centre = offsetCentre(footprintOffsets(kind, yaw));
  return {
    kind,
    origin: {
      x: block.x + 0.5 + centre.x,
      y: block.y + 1,
      z: block.z + 0.5 + centre.z,
    },
    yaw,
  };
}

/** The occupied floor cells, in `spec.cells` order. */
export function furnitureCells(pose: FurniturePose): Cell[] {
  const offsets = footprintOffsets(pose.kind, pose.yaw);
  const centre = offsetCentre(offsets);
  return offsets.map((offset) =>
    cellOf({
      x: pose.origin.x + offset.x - centre.x,
      y: pose.origin.y,
      z: pose.origin.z + offset.z - centre.z,
    }),
  );
}

/** The cells directly below the floor cells, whose top faces must be solid. */
export function furnitureSupportCells(pose: FurniturePose): Cell[] {
  return furnitureCells(pose).map((cell) => ({ ...cell, y: cell.y - 1 }));
}

/** The floor cells and `clearance - 1` layers above them, which must all be air. */
export function furnitureClearCells(pose: FurniturePose): Cell[] {
  const floor = furnitureCells(pose);
  const cells: Cell[] = [];
  for (let up = 0; up < FURNITURE_SPEC[pose.kind].clearance; up++)
    for (const cell of floor) cells.push({ ...cell, y: cell.y + up });
  return cells;
}
