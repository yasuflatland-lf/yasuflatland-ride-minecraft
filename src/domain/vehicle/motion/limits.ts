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

type GroundSpec = MotionLimits & TyreLimits;

export function motionLimitsOf(
  spec: Pick<GroundSpec, keyof MotionLimits>,
): MotionLimits {
  return Object.freeze({
    maxSpeed: spec.maxSpeed,
    maxReverse: spec.maxReverse,
    accel: spec.accel,
    reverseAccel: spec.reverseAccel,
    brake: spec.brake,
    drag: spec.drag,
    turnRate: spec.turnRate,
    steerFullSpeed: spec.steerFullSpeed,
    grip: spec.grip,
  });
}

export function tyreLimitsOf(
  spec: Pick<GroundSpec, keyof TyreLimits>,
): TyreLimits {
  return Object.freeze({
    handbrakeGrip: spec.handbrakeGrip,
    creepSpeed: spec.creepSpeed,
  });
}
