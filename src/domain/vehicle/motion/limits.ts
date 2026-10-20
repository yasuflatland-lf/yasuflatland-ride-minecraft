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
  readonly handbrakeGrip: number;
  readonly creepSpeed: number;
}
