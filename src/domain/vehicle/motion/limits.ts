/** Each drive holds its own value (ADR 0055). */
export interface MotionLimits {
  readonly maxSpeed: number;
  readonly maxReverse: number;
  readonly accel: number;
  readonly reverseAccel: number;
  readonly brake: number;
  readonly drag: number;
  readonly turnRate: number;
  readonly steerFullSpeed: number;
  readonly grip: number;
}

/**
 * Values only the ground step reads (ADR 0089): the grip under the handbrake and
 * the creep speed (ADR 0018). A kind without a ground handbrake, such as the
 * sports boat, gives its creep speed to the medium step on its own.
 */
export interface TyreLimits {
  readonly handbrakeGrip: number;
  readonly creepSpeed: number;
}
