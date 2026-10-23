import { clamp, degToRad } from "../shared/vec";
import { SPEC } from "./spec";

export interface RawInput {
  readonly moveX: number;
  readonly moveY: number;
  readonly jump: boolean;
}
/**
 * The stick and Jump before any kind gives them a meaning (ADR 0018, 0089).
 * Each kind maps `jump` and `sideways` to its own controls.
 */
export interface ControlInput {
  readonly throttle: number;
  readonly steer: number;
  /** Jump is held. */
  readonly jump: boolean;
  /** The stick is held sideways (ADR 0018): it only steers, and `throttle` is 0. */
  readonly sideways: boolean;
}

export const NEUTRAL_CONTROL: ControlInput = Object.freeze({
  throttle: 0,
  steer: 0,
  jump: false,
  sideways: false,
});

const SIDEWAYS_SLOPE = Math.tan(degToRad(SPEC.sidewaysAngle));

/**
 * Converts the movement vector and Jump to a control input (ADR 0018, 0089).
 * No input, as on a tick without a driver, is neutral.
 */
export function toDriveInput(raw: RawInput | undefined): ControlInput {
  if (
    raw === undefined ||
    !Number.isFinite(raw.moveX) ||
    !Number.isFinite(raw.moveY)
  ) {
    return NEUTRAL_CONTROL;
  }
  const steer = clamp(raw.moveX, -1, 1);
  const across = Math.abs(steer);
  // A phone stick pushed straight right reads about -0.2 forward/backward,
  // which would otherwise reverse the vehicle and flip the steering.
  if (
    across > SPEC.throttleDeadzone &&
    Math.abs(raw.moveY) <= across * SIDEWAYS_SLOPE
  ) {
    return { throttle: 0, steer, jump: raw.jump, sideways: true };
  }
  const magnitude = Math.abs(raw.moveY);
  const throttle =
    magnitude <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(raw.moveY) * Math.min(1, magnitude / SPEC.throttleFullAt);
  return { throttle, steer, jump: raw.jump, sideways: false };
}
