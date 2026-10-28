import { SPORTSBOAT_SPEC } from "./spec";

const { surfacing } = SPORTSBOAT_SPEC.icebreaker;

/** Upward impulse in blocks/tick for a hull under `depth` of water; 0 at normal depth (ADR 0175). */
export function surfaceLift(depth: number): number {
  if (depth <= surfacing.maxDepth) return 0;
  return Math.min(
    surfacing.maxLift,
    (depth - surfacing.maxDepth) * surfacing.gain,
  );
}
