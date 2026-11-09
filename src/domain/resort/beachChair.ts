import { type Cell, cellOf } from "../shared/cells";
import { type Facing4, snapYaw4 } from "../shared/facing";
import { forward, type Vec3 } from "../shared/vec";
import { BEACH_CHAIR_SPEC } from "./spec";

/** A placed beach chair. Immutable. */
export interface BeachChairPose {
  /** The foot-end cell, one above the pressed block. */
  readonly foot: Cell;
  /** The head-end cell, one step from `foot` away from the player. */
  readonly head: Cell;
  /** The entity's facing; the model's -z (foot end) points toward the player. */
  readonly yaw: Facing4;
}

/** The unit step of a quarter-turn yaw, as exact integers. */
function quarterStep(yaw: Facing4): { x: number; z: number } {
  const f = forward(yaw);
  return { x: Math.round(f.x), z: Math.round(f.z) };
}

/** `pressed` is the block whose top face was used; the chair lies along the player's facing. */
export function beachChairPose(
  pressed: Cell,
  playerYaw: number,
): BeachChairPose {
  const yaw = snapYaw4(playerYaw + 180);
  const toFoot = quarterStep(yaw);
  const foot = { x: pressed.x, y: pressed.y + 1, z: pressed.z };
  return {
    foot,
    head: { x: foot.x - toFoot.x, y: foot.y, z: foot.z - toFoot.z },
    yaw,
  };
}

/** Rebuilds the pose of a placed chair from its origin and facing. */
export function beachChairPoseAt(origin: Vec3, yaw: Facing4): BeachChairPose {
  const toFoot = quarterStep(yaw);
  // The origin is the boundary of the two cells, so half a block either way is a cell centre.
  const centre = (sign: number): Cell =>
    cellOf({
      x: origin.x + sign * toFoot.x * 0.5,
      y: origin.y + 0.5,
      z: origin.z + sign * toFoot.z * 0.5,
    });
  return { foot: centre(1), head: centre(-1), yaw };
}

/** The middle of the boundary between the two cells, at floor height. */
export function beachChairOrigin(pose: BeachChairPose): Vec3 {
  return {
    x: (pose.foot.x + pose.head.x) / 2 + 0.5,
    y: pose.foot.y,
    z: (pose.foot.z + pose.head.z) / 2 + 0.5,
  };
}

/** The two floor cells, foot first. */
export function beachChairCells(pose: BeachChairPose): readonly [Cell, Cell] {
  return [pose.foot, pose.head];
}

/** The cells below the chair, whose top faces must be solid. */
export function beachChairSupportCells(
  pose: BeachChairPose,
): readonly [Cell, Cell] {
  const below = (c: Cell): Cell => ({ x: c.x, y: c.y - 1, z: c.z });
  return [below(pose.foot), below(pose.head)];
}

/** The floor cells and `headroom - 1` layers above them. All must be air and outside vehicle and camp space. */
export function beachChairClearCells(pose: BeachChairPose): Cell[] {
  const cells: Cell[] = [];
  for (let up = 0; up < BEACH_CHAIR_SPEC.headroom; up++)
    for (const c of beachChairCells(pose))
      cells.push({ x: c.x, y: c.y + up, z: c.z });
  return cells;
}

/** The cells that get the invisible table block: the two floor cells. */
export function tableBlockCells(pose: BeachChairPose): readonly [Cell, Cell] {
  return beachChairCells(pose);
}

export type ChairForm = "chair" | "table";

export interface ChairState {
  readonly form: ChairForm;
  /** Someone is lying on the chair. */
  readonly occupied: boolean;
  /** A lantern, an oven, or a block sits on the table top. */
  readonly somethingOnTop: boolean;
}

export type FormChange =
  | { readonly ok: true; readonly to: ChairForm }
  | {
      readonly ok: false;
      readonly reason: "occupied" | "somethingOnTop" | "wrongForm";
    };

/** chair to table; refused while someone is lying on it. */
export function fold(state: ChairState): FormChange {
  if (state.form !== "chair") return { ok: false, reason: "wrongForm" };
  if (state.occupied) return { ok: false, reason: "occupied" };
  return { ok: true, to: "table" };
}

/** table to chair; refused while anything is on the top. */
export function unfold(state: ChairState): FormChange {
  if (state.form !== "table") return { ok: false, reason: "wrongForm" };
  if (state.somethingOnTop) return { ok: false, reason: "somethingOnTop" };
  return { ok: true, to: "chair" };
}

export type TakeBack =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "occupied" | "somethingOnTop" };

/** Either form can be taken back unless someone lies on it or anything is on top. */
export function canTakeBack(state: ChairState): TakeBack {
  if (state.occupied) return { ok: false, reason: "occupied" };
  if (state.somethingOnTop) return { ok: false, reason: "somethingOnTop" };
  return { ok: true };
}

export type ChairMenuChoice = "lie_down" | "fold";

/** Menu order. */
export const CHAIR_MENU_CHOICES: readonly ChairMenuChoice[] = Object.freeze([
  "lie_down",
  "fold",
]);
