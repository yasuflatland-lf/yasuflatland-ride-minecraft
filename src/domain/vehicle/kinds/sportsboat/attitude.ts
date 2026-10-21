// How the hull sits on the water as it drives: the bow rises while the boat
// gains speed, and the hull rolls into a turn (ADR 0059, ADR 0061, ADR 0079).
import { approach, clamp } from "../../../shared/vec";
import type { MotionLimits } from "../../motion/limits";
import { turnFraction } from "../../motion/turn";
import { SPORTSBOAT_SPEC } from "./spec";

/** Trim and roll limits, read from SPORTSBOAT_SPEC (ADR 0087). */
export const SPORTSBOAT_ATTITUDE = Object.freeze({
  maxTrim: SPORTSBOAT_SPEC.maxTrim,
  trimRiseRate: SPORTSBOAT_SPEC.trimRiseRate,
  trimSettleRate: SPORTSBOAT_SPEC.trimSettleRate,
  maxRoll: SPORTSBOAT_SPEC.maxRoll,
  rollRate: SPORTSBOAT_SPEC.rollRate,
});

/**
 * Next bow rise in degrees, 0 to `maxTrim`. Afloat, the target follows how
 * much forward speed the tick gained; reversing, slowing, or holding speed
 * gives a level target, as does running aground.
 */
export function stepTrim(
  prev: number,
  speedBefore: number,
  speedAfter: number,
  afloat: boolean,
  limits: Pick<MotionLimits, "accel">,
): number {
  const gain = Math.max(speedAfter, 0) - Math.max(speedBefore, 0);
  // A zero accel limit gives Infinity or NaN; hold the bow level then.
  const share = gain / limits.accel;
  const target =
    afloat && Number.isFinite(share)
      ? clamp(share, 0, 1) * SPORTSBOAT_ATTITUDE.maxTrim
      : 0;
  return approach(
    prev,
    target,
    SPORTSBOAT_ATTITUDE.trimRiseRate,
    SPORTSBOAT_ATTITUDE.trimSettleRate,
  );
}

/**
 * Next roll in degrees; positive lowers the right side, as the SUV's bank
 * does (ADR 0026). Afloat, the target leans by the sign of speed times yaw
 * rate, in proportion to how fast the heading turns and to the signed speed,
 * so the hull leans toward the same side forward and in reverse for the same
 * stick, and stays level when it turns slowly or at rest (ADR 0059, ADR 0079).
 * Aground, the target is level.
 */
export function stepRoll(
  prev: number,
  yawBefore: number,
  yawAfter: number,
  speed: number,
  afloat: boolean,
  limits: Pick<MotionLimits, "turnRate" | "maxSpeed">,
): number {
  const turn = turnFraction(yawBefore, yawAfter, limits.turnRate);
  // A zero top speed gives Infinity or NaN; hold the hull level then.
  const pace = speed / limits.maxSpeed;
  const target =
    afloat && turn !== undefined && Number.isFinite(pace)
      ? clamp(turn, -1, 1) * clamp(pace, -1, 1) * SPORTSBOAT_ATTITUDE.maxRoll
      : 0;
  return approach(prev, target, SPORTSBOAT_ATTITUDE.rollRate);
}
