// How the camper's doors swing: the entry door, the shower door, and every storage door.
import { clamp } from "../../../shared/vec";
import { CAMPER_SPEC } from "./spec";

// A door swings one step per tick (ADR 0068).
export const DOOR_STEPS = CAMPER_SPEC.doorSwingTicks;

/** A door's swing restored in DOOR_STEPS; a camper that was not docked starts with it shut. */
export function restoredDoorStep(open: unknown, docked: boolean): number {
  if (!docked || typeof open !== "number") return 0;
  return clamp(Math.round(open * DOOR_STEPS), 0, DOOR_STEPS);
}

/** Moves a door one step toward open or shut. */
export function swing(step: number, open: boolean): number {
  return step + Math.sign((open ? DOOR_STEPS : 0) - step);
}
