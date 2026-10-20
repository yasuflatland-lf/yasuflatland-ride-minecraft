// One tick of vehicle movement (ADR 0002, 0003, 0074, 0081).
import {
  clamp,
  clampLength,
  dot,
  forward,
  normalizeYaw,
  type Vec2,
} from "../../shared/vec";
import type { DriveInput } from "../driveInput";
import { MOTION } from "./constants";
import type { MotionLimits } from "./limits";

export interface Medium {
  readonly drag: number;
  readonly maxSpeed: number;
  /**
   * Drag the per-axis wall check compares against, `drag` when absent. A
   * medium whose drag is estimated each tick sets it to the estimate the
   * estimator checked walls against, so one tick gets one wall decision
   * (ADR 0053).
   */
  readonly wallDrag?: number;
}

export interface MotionState {
  readonly speed: number; // Internal forward/reverse speed (blocks/tick; negative means reverse)
  readonly yaw: number;
  readonly friction?: number; // Ground friction estimate; undefined until estimated
  // Velocity the script aimed for in the previous tick. Kept only when that
  // tick was on the ground: in the air the engine applies airFriction and only
  // airControl of the impulse, so the ratio would not measure ground friction.
  readonly expected?: Vec2;
  // Velocity the medium step aimed for in the previous tick, kept apart from
  // `expected` so its ratios never feed the ground friction estimate.
  readonly mediumExpected?: Vec2;
  readonly stepTicks: number; // Remaining ticks of control in the air after jumping up a step
}

export function initialMotion(yaw: number): MotionState {
  return { speed: 0, yaw: normalizeYaw(yaw), stepTicks: 0 };
}

/** Turns to a boarding driver's yaw when nearly stopped (ADR 0019). */
export function alignOnMount(
  state: MotionState,
  driverYaw: number,
): MotionState {
  return Math.abs(state.speed) < MOTION.mountAlignSpeed
    ? { ...state, yaw: normalizeYaw(driverYaw) }
    : state;
}

export interface Observation {
  velocity: Vec2;
  onGround: boolean;
}
/** Height of the step to jump onto now: 0 for none (ADR 0004, 0035). */
export type StepProbe = (f: Vec2, speed: number) => 0 | 1 | 2;
export interface MotionResult {
  state: MotionState;
  forward: Vec2;
  impulse: Vec2;
  /** Upward velocity to give for a step jump this tick, 0 when not jumping (ADR 0004, 0035). */
  jumpVelocity: number;
  blocked: boolean; // Whether a wall collision was detected this tick
}

export function updateSpeed(
  speed: number,
  throttle: number,
  creep: boolean,
  limits: MotionLimits,
): number {
  if (creep) {
    if (speed >= limits.creepSpeed)
      return Math.max(limits.creepSpeed, speed - limits.drag);
    return Math.min(
      limits.creepSpeed,
      speed + (speed < 0 ? limits.brake : limits.accel),
    );
  }
  let s = speed;
  // A light brake must not slow the vehicle less than releasing the stick (ADR 0074).
  if (throttle > 0)
    s +=
      s < 0
        ? Math.max(limits.drag, limits.brake * throttle)
        : limits.accel * throttle;
  else if (throttle < 0)
    s -=
      s > 0
        ? Math.max(limits.drag, limits.brake * -throttle)
        : limits.reverseAccel * -throttle;
  else s -= Math.sign(s) * Math.min(Math.abs(s), limits.drag);
  return clamp(s, -limits.maxReverse, limits.maxSpeed);
}

/** Steering is weaker at low speed and reversed when backing up. Left input (steer > 0) decreases yaw. */
export function steerYaw(
  yaw: number,
  speed: number,
  steer: number,
  limits: MotionLimits,
): number {
  const factor =
    Math.min(1, Math.abs(speed) / limits.steerFullSpeed) * Math.sign(speed);
  return normalizeYaw(yaw - steer * limits.turnRate * factor);
}

export interface BlockedAxes {
  readonly x: boolean;
  readonly z: boolean;
}

/**
 * Which axes kept less than `keptRatio` of the velocity given on them. The
 * engine zeroes velocity per axis at walls, so x and z are checked
 * separately (ADR 0003, 0081).
 */
export function blockedAxes(
  v: Vec2,
  given: Vec2,
  keptRatio: number,
): BlockedAxes {
  const axisBlocked = (ve: number, ee: number) =>
    Math.abs(ee) > MOTION.blockedAxisMin && ve / ee < keptRatio;
  return { x: axisBlocked(v.x, given.x), z: axisBlocked(v.z, given.z) };
}

/** Whether either axis hit a wall (ADR 0003). */
export function hitWall(v: Vec2, given: Vec2, keptRatio: number): boolean {
  const axes = blockedAxes(v, given, keptRatio);
  return axes.x || axes.z;
}

/**
 * The internal speed after a wall hit (ADR 0081). With one axis blocked and
 * the heading still running along the wall, keep the speed whose free-axis
 * component matches the observed along-wall velocity; otherwise keep the
 * observed forward speed. Never raises the speed or changes its sign.
 */
export function speedAfterWall(
  speed: number,
  v: Vec2,
  f: Vec2,
  axes: BlockedAxes,
): number {
  const sgn = Math.sign(speed);
  if (sgn === 0) return 0;
  let kept = Math.max(0, sgn * dot(v, f));
  if (axes.x !== axes.z) {
    const fFree = axes.x ? f.z : f.x;
    const vFree = axes.x ? v.z : v.x;
    if (
      Math.abs(fFree) >= MOTION.wallSlideMinCos &&
      Math.sign(vFree) === Math.sign(fFree) * sgn
    )
      kept = Math.abs(vFree) / Math.abs(fFree);
  }
  return sgn * Math.min(Math.abs(speed), kept);
}

export function stepMotion(
  prev: MotionState,
  input: DriveInput,
  obs: Observation,
  probe: StepProbe,
  limits: MotionLimits,
): MotionResult {
  let speed = updateSpeed(prev.speed, input.throttle, input.creep, limits);
  const yaw = steerYaw(prev.yaw, speed, input.steer, limits);
  const f = forward(yaw);
  const v = obs.velocity;
  const vLong = dot(v, f);

  // Distinguish friction from wall collisions by how much of the previous
  // tick's given velocity remains (ADR 0003).
  let friction = prev.friction;
  let blocked = false;
  if (prev.expected && obs.onGround) {
    const e = prev.expected;
    const limit = (friction ?? MOTION.defaultFriction) * MOTION.blockedRatio;
    const axes = blockedAxes(v, e, limit);
    blocked = axes.x || axes.z;
    if (blocked) {
      // While colliding, freeze the friction estimate (ADR 0003) and slide
      // along the wall (ADR 0081).
      speed = speedAfterWall(speed, v, f, axes);
    } else {
      const eLen2 = e.x * e.x + e.z * e.z;
      if (eLen2 > MOTION.minExpectedForFriction ** 2) {
        const r = clamp(
          dot(v, e) / eLen2,
          MOTION.frictionMin,
          MOTION.frictionMax,
        );
        friction =
          friction === undefined
            ? r
            : friction * (1 - MOTION.frictionEma) + r * MOTION.frictionEma;
      }
    }
  }
  const applied = obs.onGround
    ? (friction ?? MOTION.defaultFriction)
    : MOTION.airFriction;

  // Steps (ADR 0004, 0035)
  let jumpVelocity = 0;
  let stepTicks = prev.stepTicks;
  const height =
    input.throttle > 0 && speed >= 0 && obs.onGround ? probe(f, speed) : 0;
  if (height > 0) {
    jumpVelocity = height === 2 ? MOTION.stepVelocity : MOTION.oneStepVelocity;
    speed = Math.max(speed, MOTION.stepMinSpeed);
    stepTicks = MOTION.stepTicks;
  }
  const stepping = stepTicks > 0;
  if (stepping) stepTicks--;

  // Set the forward component to the internal speed, cancel a grip-sized
  // fraction of the sideways component, and cap the result at max speed (ADR 0002).
  const lat = { x: v.x - f.x * vLong, z: v.z - f.z * vLong };
  const grip = input.handbrake ? limits.handbrakeGrip : limits.grip;
  // A blocked tick carries no sideways velocity, so the along-wall speed
  // stays at its impact value (ADR 0081).
  const keepLat = stepping || blocked ? 0 : 1 - grip;
  const target = clampLength(
    { x: f.x * speed + lat.x * keepLat, z: f.z * speed + lat.z * keepLat },
    limits.maxSpeed,
  );
  // Pre-divide by friction so the velocity left after the engine applies
  // friction this tick is the target.
  const given = { x: target.x / applied, z: target.z / applied };
  const control = obs.onGround || stepping ? 1 : MOTION.airControl;
  return {
    state: {
      ...prev,
      speed,
      yaw,
      ...(friction === undefined ? {} : { friction }),
      expected: obs.onGround ? given : undefined,
      mediumExpected: undefined,
      stepTicks,
    },
    forward: f,
    jumpVelocity,
    blocked,
    impulse: { x: (given.x - v.x) * control, z: (given.z - v.z) * control },
  };
}

/**
 * One tick of horizontal movement in a medium whose engine drag the script
 * pre-divides: air or water with gravity off, or a buoyant hull (ADR 0021,
 * 0053, 0075). There is no ground friction to estimate, so the impulse is
 * pre-divided by the medium's drag and applied in full. The handbrake does
 * not exist here. Walls are detected per axis against the medium's wall
 * drag and slid along as on the ground (ADR 0003, 0081). Step rise is
 * handled by the aggregate.
 */
export function stepMediumMotion(
  prev: MotionState,
  input: DriveInput,
  v: Vec2,
  medium: Medium,
  limits: MotionLimits,
): MotionResult {
  // Without the cap, speed keeps climbing toward limits.maxSpeed under water
  // while clampLength hides it, and a released throttle coasts at full water
  // speed until speed falls back below maxWaterSpeed.
  const maxSpeed = Math.min(limits.maxSpeed, medium.maxSpeed);
  let speed = Math.min(
    updateSpeed(prev.speed, input.throttle, input.creep, limits),
    maxSpeed,
  );
  const yaw = steerYaw(prev.yaw, speed, input.steer, limits);
  const f = forward(yaw);
  const vLong = dot(v, f);
  const axes: BlockedAxes =
    prev.mediumExpected === undefined
      ? { x: false, z: false }
      : blockedAxes(
          v,
          prev.mediumExpected,
          (medium.wallDrag ?? medium.drag) * MOTION.blockedRatio,
        );
  const blocked = axes.x || axes.z;
  if (blocked) speed = speedAfterWall(speed, v, f, axes);
  // A blocked tick carries no sideways velocity (ADR 0081).
  const keepLat = blocked ? 0 : 1 - limits.grip;
  const target = clampLength(
    {
      x: f.x * speed + (v.x - f.x * vLong) * keepLat,
      z: f.z * speed + (v.z - f.z * vLong) * keepLat,
    },
    maxSpeed,
  );
  const given = {
    x: target.x / medium.drag,
    z: target.z / medium.drag,
  };
  return {
    state: {
      ...prev,
      speed,
      yaw,
      expected: undefined,
      mediumExpected: given,
      stepTicks: 0,
    },
    forward: f,
    jumpVelocity: 0,
    blocked,
    impulse: { x: given.x - v.x, z: given.z - v.z },
  };
}
