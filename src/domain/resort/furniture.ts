import { type Cell, cellKey, type ProtectedSpace } from "../shared/cells";
import { type Facing4, snapYaw4 } from "../shared/facing";
import {
  type CellOffset,
  footprintCellsAt,
  footprintClearCells,
  footprintOffsets,
  footprintOrigin,
  footprintSupportCells,
} from "../shared/gearFootprint";
import type { GiveBackPolicy } from "../shared/giveBack";
import { GEAR_RECOVERY, type HitRule } from "../shared/hitCounter";
import type { TopSurface } from "../shared/tableTop";
import { ticks } from "../shared/ticks";
import { forward, type Vec3 } from "../shared/vec";
import { RESORT_REFUSES } from "./spec";

export type FurnitureKind =
  | "dining_table"
  | "dining_chair"
  | "sofa_single"
  | "sofa_double"
  | "toilet"
  | "washstand";

/** A seat relative to the entity origin, in blocks; must match the pack's `minecraft:rideable` seats. */
interface SeatOffset {
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
  readonly recovery: HitRule;
  readonly giveBack: GiveBackPolicy;
  readonly refuses: readonly ProtectedSpace[];
  /** Only furniture that hosts lanterns and ovens has a top. */
  readonly top?: TopSurface;
}

// Dining Chair and both sofas have seat offsets finalized against their models (ADR 0240).
export const FURNITURE_SPEC: Readonly<Record<FurnitureKind, FurnitureSpec>> =
  Object.freeze({
    dining_table: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([]),
      recovery: GEAR_RECOVERY,
      giveBack: "hitter",
      refuses: RESORT_REFUSES,
      top: Object.freeze({
        half: Object.freeze({ halfX: 6, halfZ: 6 }),
        topPx: 12,
        limit: 1,
        clearanceBase: 1,
      }),
    }),
    dining_chair: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([Object.freeze({ x: 0, y: 0.21, z: -0.00625 })]),
      recovery: GEAR_RECOVERY,
      giveBack: "hitter",
      refuses: RESORT_REFUSES,
    }),
    sofa_single: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([Object.freeze({ x: 0, y: 0.2475, z: -0.1 })]),
      recovery: GEAR_RECOVERY,
      giveBack: "hitter",
      refuses: RESORT_REFUSES,
    }),
    sofa_double: Object.freeze({
      cells: Object.freeze([
        Object.freeze({ ahead: 0, left: 0 }),
        Object.freeze({ ahead: 0, left: -1 }),
      ]),
      clearance: 2,
      seats: Object.freeze([
        Object.freeze({ x: -0.5, y: 0.2475, z: -0.1 }),
        Object.freeze({ x: 0.5, y: 0.2475, z: -0.1 }),
      ]),
      recovery: GEAR_RECOVERY,
      giveBack: "hitter",
      refuses: RESORT_REFUSES,
    }),
    toilet: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      // The 8.06 px seat top minus the 0.24-block rider offset (ADR 0122), rounded.
      seats: Object.freeze([Object.freeze({ x: 0, y: 0.264, z: -0.1 })]),
      recovery: GEAR_RECOVERY,
      giveBack: "hitter",
      refuses: RESORT_REFUSES,
    }),
    washstand: Object.freeze({
      cells: Object.freeze([Object.freeze({ ahead: 0, left: 0 })]),
      clearance: 2,
      seats: Object.freeze([]),
      recovery: GEAR_RECOVERY,
      giveBack: "hitter",
      refuses: RESORT_REFUSES,
    }),
  });

export interface FurniturePose {
  readonly kind: FurnitureKind;
  readonly origin: Vec3;
  readonly yaw: Facing4;
}

// Search past two blocks because Beach Chairs that far apart can share an end cell.
export const RESORT_GEAR_QUERY_RADIUS = 3;

export function overlapsAny(
  cells: readonly Cell[],
  occupied: readonly Cell[],
): boolean {
  const keys = new Set(occupied.map(cellKey));
  return cells.some((cell) => keys.has(cellKey(cell)));
}

/** `block` is the block whose top face was used; the pressed column's floor cell is one above it. */
export function furniturePose(
  block: Cell,
  playerYaw: number,
  kind: FurnitureKind,
): FurniturePose {
  const yaw = snapYaw4(playerYaw + 180);
  const offsets = footprintOffsets(
    FURNITURE_SPEC[kind].cells,
    forward(yaw + 180),
  );
  return furniturePoseAt(kind, footprintOrigin(block, offsets), yaw);
}

export function furniturePoseAt(
  kind: FurnitureKind,
  origin: Vec3,
  yaw: Facing4,
): FurniturePose {
  return { kind, origin, yaw };
}

/** The occupied floor cells, in `spec.cells` order. */
export function furnitureCells(pose: FurniturePose): Cell[] {
  return footprintCellsAt(
    pose.origin,
    footprintOffsets(FURNITURE_SPEC[pose.kind].cells, forward(pose.yaw + 180)),
  );
}

/** The cells directly below the floor cells, whose top faces must be solid. */
export function furnitureSupportCells(pose: FurniturePose): Cell[] {
  return footprintSupportCells(furnitureCells(pose));
}

/** The floor cells and `clearance - 1` layers above them, which must all be air. */
export function furnitureClearCells(pose: FurniturePose): Cell[] {
  return footprintClearCells(
    furnitureCells(pose),
    FURNITURE_SPEC[pose.kind].clearance,
  );
}

export const FURNITURE_TOP_SYNC_TICKS = ticks(20);

export function diningTableTopCells(pose: FurniturePose): Cell[] {
  return furnitureCells(pose);
}
