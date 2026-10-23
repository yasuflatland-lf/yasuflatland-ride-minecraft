import { normalizeYaw, type Vec2 } from "../../shared/vec";
import type { MotionLimits, TyreLimits } from "./limits";
import {
  type Medium,
  type MotionResult,
  type MotionState,
  type Observation,
  type StepProbe,
  stepMediumMotion,
  stepMotion,
} from "./motion";

function pivotYaw(yaw: number, steer: number, turnRate: number): number {
  return normalizeYaw(yaw - steer * turnRate);
}
export function pivotSpeed(speed: number, brake: number): number {
  return Math.sign(speed) * Math.max(0, Math.abs(speed) - brake);
}
const NEUTRAL = { throttle: 0, steer: 0, handbrake: false, creep: false };
export function pivotGroundStep(
  prev: MotionState,
  steer: number,
  obs: Observation,
  probe: StepProbe,
  limits: MotionLimits,
  tyres: TyreLimits,
): MotionResult {
  return stepMotion(
    {
      ...prev,
      speed: pivotSpeed(prev.speed, limits.brake),
      yaw: pivotYaw(prev.yaw, steer, limits.turnRate),
    },
    NEUTRAL,
    obs,
    probe,
    { ...limits, drag: 0 },
    tyres,
  );
}
export function pivotMediumStep(
  prev: MotionState,
  steer: number,
  v: Vec2,
  medium: Medium,
  limits: MotionLimits,
): MotionResult {
  return stepMediumMotion(
    {
      ...prev,
      speed: pivotSpeed(prev.speed, limits.brake),
      yaw: pivotYaw(prev.yaw, steer, limits.turnRate),
    },
    NEUTRAL,
    v,
    medium,
    { ...limits, drag: 0 },
    0,
  );
}
