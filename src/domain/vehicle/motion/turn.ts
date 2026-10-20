import { normalizeYaw } from "../../shared/vec";

/**
 * How much of the full turn rate the heading turned this tick, signed
 * (positive when yaw increases), measured across the ±180° wrap. Undefined
 * when it is not finite, such as for a zero turn rate.
 */
export function turnFraction(
  yawBefore: number,
  yawAfter: number,
  turnRate: number,
): number | undefined {
  const turn = normalizeYaw(yawAfter - yawBefore) / turnRate;
  return Number.isFinite(turn) ? turn : undefined;
}
