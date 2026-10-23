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

const NEUTRAL = { throttle: 0, steer: 0, handbrake: false, creep: false };

export function pivotSpeed(speed: number, brake: number): number {
  return Math.sign(speed) * Math.max(0, Math.abs(speed) - brake);
}

function pivoted(
  prev: MotionState,
  steer: number,
  limits: MotionLimits,
): MotionState {
  return {
    ...prev,
    speed: pivotSpeed(prev.speed, limits.brake),
    yaw: normalizeYaw(prev.yaw - steer * limits.turnRate),
  };
}

export function pivotGroundStep(
  prev: MotionState,
  steer: number,
  obs: Observation,
  probe: StepProbe,
  limits: MotionLimits,
  tyres: TyreLimits,
): MotionResult {
  return stepMotion(
    pivoted(prev, steer, limits),
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
    pivoted(prev, steer, limits),
    NEUTRAL,
    v,
    medium,
    { ...limits, drag: 0 },
    0,
  );
}
