import { MOTION } from "./constants";
import type { MotionLimits } from "./limits";
import type { Medium } from "./motion";

export class BoostRule {
  constructor(readonly flightScale: number) {
    if (!Number.isFinite(flightScale) || flightScale < 1)
      throw new RangeError("Flight boost scale must be finite and at least 1");
    Object.freeze(this);
  }
}

export function boostedLimits(
  limits: MotionLimits,
  scale: number,
): MotionLimits {
  return Object.freeze({ ...limits, maxSpeed: limits.maxSpeed * scale });
}

export function boostedMedium(medium: Medium, scale: number): Medium {
  return Object.freeze({ ...medium, maxSpeed: medium.maxSpeed * scale });
}

export class SpeedCeiling {
  private peakScale = 1;
  private bleedTicks = 0;

  constructor(private readonly normal: number) {}

  next(boosted: boolean, scale: number): number {
    if (boosted) {
      this.peakScale = scale;
      this.bleedTicks = 0;
    } else if (this.peakScale > 1) {
      this.bleedTicks++;
    }
    // Counting from the peak avoids accumulating rounding error on every step.
    const currentScale = this.peakScale - this.bleedTicks * MOTION.boostBleed;
    if (currentScale > 1) return this.normal * currentScale;
    this.peakScale = 1;
    this.bleedTicks = 0;
    return this.normal;
  }
}
