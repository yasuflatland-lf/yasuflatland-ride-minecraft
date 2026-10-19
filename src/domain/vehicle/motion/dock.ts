// When a stopped vehicle counts as held, shared by every kind that holds (ADR 0063, 0068).
import type { RawInput } from "../driveInput";

export const DOCK = Object.freeze({
  /** ADR 0063: below 0.005 blocks/tick counts as stopped. */
  maxSpeed: 0.005,
  /** ADR 0063: require 20 consecutive stopped ticks (1 second). */
  ticks: 20,
  /** ADR 0063: stick movement above 0.1 requests departure. */
  stick: 0.1,
});

export function pushesStick(input: RawInput | undefined): boolean {
  return (
    input !== undefined &&
    Math.max(Math.abs(input.moveX), Math.abs(input.moveY)) > DOCK.stick
  );
}
