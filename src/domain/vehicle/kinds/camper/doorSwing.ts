// Opening progress shared by the entry door, shower door and hinged or sliding storage.
import { clamp } from "../../../shared/vec";
import { CAMPER_SPEC } from "./spec";

// Opening progress advances one step per tick (ADR 0068, 0121).
export const DOOR_STEPS = CAMPER_SPEC.doorSwingTicks;

/** Opening progress restored in DOOR_STEPS; a camper that was not docked starts with it shut. */
export function restoredDoorStep(open: unknown, docked: boolean): number {
  if (!docked || typeof open !== "number") return 0;
  return clamp(Math.round(open * DOOR_STEPS), 0, DOOR_STEPS);
}

/** Advances opening progress one step toward open or shut. */
export function stepOpening(step: number, open: boolean): number {
  return step + Math.sign((open ? DOOR_STEPS : 0) - step);
}

/** The opening progress that drives an entry or shower door's swing. */
export function swing(step: number, open: boolean): number {
  return stepOpening(step, open);
}
