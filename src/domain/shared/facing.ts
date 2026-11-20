import type { Brand } from "./ids";
import { normalizeYaw } from "./vec";

export const QUARTER_TURN = 90;

/** Quarter-turn index, clockwise from yaw 0 through 270. */
export type Quarter = 0 | 1 | 2 | 3;

/** Cardinal yaw in [0, 360) for resort and roof tent pose tables. */
export type Facing4 = 0 | 90 | 180 | 270;

/** Entity rotation in (-180, 180], snapped to a whole step. */
export type SnappedYaw = Brand<number, "SnappedYaw">;

/** Half-step ties round toward positive yaw. */
export function snapYaw(yaw: number, step: number = QUARTER_TURN): SnappedYaw {
  if (!Number.isInteger(step) || step <= 0 || 360 % step !== 0) {
    throw new RangeError("Yaw step must be a positive integer divisor of 360");
  }
  return (normalizeYaw(Math.round(yaw / step) * step) + 0) as SnappedYaw;
}

export function facePlayer(
  playerYaw: number,
  step: number = QUARTER_TURN,
): SnappedYaw {
  return snapYaw(playerYaw + 180, step);
}

export function quarterOf(yaw: number): Quarter {
  return (((Math.round(yaw / QUARTER_TURN) % 4) + 4) % 4) as Quarter;
}

export function snapYaw4(yaw: number): Facing4 {
  return (quarterOf(yaw) * QUARTER_TURN) as Facing4;
}
