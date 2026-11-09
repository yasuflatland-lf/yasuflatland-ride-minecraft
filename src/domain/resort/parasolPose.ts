import type { Cell } from "../shared/cells";
import { type Facing4, snapYaw4 } from "../shared/facing";
import { footprintColumns, regularOctagonFootprint } from "../shared/footprint";
import { forward, leftOf, type Vec3 } from "../shared/vec";
import { PARASOL_SPEC } from "./spec";

/** A placed parasol's pose. Immutable. */
export interface ParasolPose {
  /** The cell the base sits in, one above the ground block. */
  readonly base: Cell;
  /** The canopy's centre at ground level. */
  readonly canopyCenter: Vec3;
  /** The entity's facing; the model's -z, the canopy side, points this way. */
  readonly yaw: Facing4;
}

/** The unit step of a quarter-turn yaw, as exact integers. */
function quarterStep(yaw: Facing4): { x: number; z: number } {
  const f = forward(yaw);
  return { x: Math.round(f.x), z: Math.round(f.z) };
}

/**
 * `pressed` is the block whose top face was used. The canopy centre is the middle of that
 * face. The base sits `baseOffset` blocks on, in the player's facing snapped to a quarter
 * turn, and the entity faces back toward the player so the canopy is on the player's side.
 */
export function parasolPose(pressed: Cell, playerYaw: number): ParasolPose {
  const yaw = snapYaw4(playerYaw + 180);
  const toCanopy = quarterStep(yaw);
  return {
    yaw,
    canopyCenter: { x: pressed.x + 0.5, y: pressed.y + 1, z: pressed.z + 0.5 },
    base: {
      x: pressed.x - toCanopy.x * PARASOL_SPEC.baseOffset,
      y: pressed.y + 1,
      z: pressed.z - toCanopy.z * PARASOL_SPEC.baseOffset,
    },
  };
}

/** Rebuilds the pose of a placed parasol from its base cell and facing. */
export function parasolPoseAt(base: Cell, yaw: number): ParasolPose {
  const facing = snapYaw4(yaw);
  const toCanopy = quarterStep(facing);
  return {
    yaw: facing,
    base,
    canopyCenter: {
      x: base.x + 0.5 + toCanopy.x * PARASOL_SPEC.baseOffset,
      y: base.y,
      z: base.z + 0.5 + toCanopy.z * PARASOL_SPEC.baseOffset,
    },
  };
}

/** The cells the base and pole occupy. All must be air and outside vehicle and camp space. */
export function parasolFootCells(pose: ParasolPose): Cell[] {
  const ahead = quarterStep(pose.yaw);
  const left = leftOf(ahead);
  return PARASOL_SPEC.footCells.map((c) => ({
    x: pose.base.x + ahead.x * c.ahead + left.x * c.left,
    y: pose.base.y + c.up,
    z: pose.base.z + ahead.z * c.ahead + left.z * c.left,
  }));
}

/** The cell below the base, whose top face must be solid. */
export function parasolSupportCell(pose: ParasolPose): Cell {
  return { x: pose.base.x, y: pose.base.y - 1, z: pose.base.z };
}

/** The columns that get a rain ceiling, in the first cell above the canopy's top (ADR 0207). */
export function parasolCeilingCells(pose: ParasolPose): Cell[] {
  return footprintColumns(
    pose.canopyCenter,
    pose.yaw,
    regularOctagonFootprint(PARASOL_SPEC.canopyFlatHalfWidth),
    Math.floor(pose.canopyCenter.y + PARASOL_SPEC.canopyTop) + 1,
  );
}

/** True when `base` is closer than `minBaseDistance` (Chebyshev) to any of `others`. */
export function tooCloseToOtherBase(
  base: Cell,
  others: readonly Cell[],
): boolean {
  return others.some(
    (other) =>
      Math.max(
        Math.abs(base.x - other.x),
        Math.abs(base.y - other.y),
        Math.abs(base.z - other.z),
      ) < PARASOL_SPEC.minBaseDistance,
  );
}
