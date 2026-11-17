import { clamp } from "../../../shared/vec";

export type Lean = { readonly angle: number };
export interface LeanLimits {
  readonly maxLean: number;
  readonly leanRate: number;
  readonly leanFullSpeed: number;
}

// Positive steer turns left (steerYaw subtracts yaw); positive lean tilts left.
// Scooter animations must preserve this sign, opposite to flight bank angles.
export function stepLean(
  prev: Lean,
  steer: number,
  speed: number,
  limits: LeanLimits,
): Lean {
  const target =
    clamp(steer, -1, 1) *
    limits.maxLean *
    Math.min(1, Math.abs(speed) / limits.leanFullSpeed);
  return {
    angle: clamp(
      prev.angle +
        clamp(target - prev.angle, -limits.leanRate, limits.leanRate),
      -limits.maxLean,
      limits.maxLean,
    ),
  };
}

export function leanLevel(lean: Lean, levels: number, maxLean: number): number {
  return Math.round(clamp(lean.angle / maxLean, -1, 1) * levels) || 0;
}
