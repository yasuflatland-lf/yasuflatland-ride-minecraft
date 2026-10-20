// When a stopped vehicle counts as held, and the step it takes while held,
// shared by every kind that holds (ADR 0063, 0068).
import { forward } from "../../shared/vec";
import type { ClearCell, Dock } from "../dock/dock";
import type { DriveStep, EngineCommand, TickContext } from "../drive";
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

/** What a kind adds to its held step; both are computed by the kind, which owns their side effects. */
export interface HeldStepExtras {
  readonly commands?: readonly EngineCommand[];
  /** Present only for a kind that clears blocks while held; the key is left out otherwise. */
  readonly clear?: readonly ClearCell[];
}

/**
 * A held vehicle stays put facing its hold yaw, and the first deck seat's
 * stick boards the deck riders (ADR 0063, 0068).
 */
export function heldStep(
  dock: Dock,
  yaw: number,
  deckSeatInputs: TickContext["deckSeatInputs"],
  extras: HeldStepExtras = {},
): DriveStep {
  const step: DriveStep = {
    dock,
    boardDeckRiders: pushesStick(deckSeatInputs[0]),
    impulse: { x: 0, y: 0, z: 0 },
    forward: forward(yaw),
    commands: extras.commands ?? [],
    riders: { thirdPerson: false, underwater: false },
  };
  return extras.clear === undefined ? step : { ...step, clear: extras.clear };
}
