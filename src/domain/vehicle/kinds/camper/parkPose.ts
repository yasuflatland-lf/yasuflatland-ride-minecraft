import {
  forward,
  leftOf,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../../../shared/vec";
import type { HoldPose } from "../../dock/floor";
import type { LocalCell } from "./furniture";

// Feet resting on a block top can read a hair below it.
const FEET_EPSILON = 0.01;

// Path, farmland, mud and soul sand tops need the floor in the next cell (ADR 0068).
const LOW_GROUND_THRESHOLD = 0.85;

export const QUARTER_TURN = 90;

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
export function axes(yaw: number): { f: Vec2; l: Vec2 } {
  const exact = forward(yaw);
  const f = { x: Math.round(exact.x) + 0, z: Math.round(exact.z) + 0 };
  const l = leftOf(f);
  return { f, l: { x: l.x + 0, z: l.z + 0 } };
}

export function cellAt(
  pose: HoldPose,
  lx: number,
  lz: number,
  dy: number,
): Vec3 {
  const { f, l } = axes(pose.yaw);
  return {
    x: Math.floor(pose.x) + lx * l.x + lz * f.x + 0,
    y: pose.y + dy,
    z: Math.floor(pose.z) + lx * l.z + lz * f.z + 0,
  };
}

/** The world cell of a local room cell at a parked pose. */
export function localCellAt(pose: HoldPose, cell: LocalCell): Vec3 {
  return cellAt(pose, cell.x, cell.z, cell.layer);
}
