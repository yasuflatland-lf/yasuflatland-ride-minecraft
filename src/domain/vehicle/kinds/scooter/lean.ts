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

/**
 * Total body roll in degrees with the sign of the scooter model's `lean`
 * animation, which rolls `root` by `lean - bank`: positive is left. In flight
 * a left turn banks negative, so bank adds to the lean (ADR 0250).
 */
export function bodyRoll(lean: Lean, bank: number): number {
  return lean.angle - bank;
}

/**
 * Signed pose level of a body roll: the 1-based index of the nearest table
 * angle, 0 below half the first angle, clamped to the table size.
 */
export function rollLevel(roll: number, angles: readonly number[]): number {
  const magnitude = Math.abs(roll);
  const first = angles[0];
  if (first === undefined || magnitude < first / 2) return 0;
  let best = 0;
  for (const [index, angle] of angles.entries())
    if (Math.abs(angle - magnitude) < Math.abs((angles[best] ?? 0) - magnitude))
      best = index;
  return Math.sign(roll) * (best + 1);
}
