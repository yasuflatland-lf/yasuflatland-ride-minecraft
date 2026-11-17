import { clamp } from "../../shared/vec";
import type { TransformingSpec } from "./transforming";

export type SurfaceLimits = Pick<
  TransformingSpec,
  "floatDraft" | "floatGain" | "surfaceRise"
>;

/** Target vertical velocity in blocks/tick; surface kinds rise to their float line without diving. */
export function surfaceHold(
  depth: number,
  carHeight: number,
  vy: number,
  limits: SurfaceLimits,
): number {
  if (!Number.isFinite(depth) || depth <= 0) return vy;
  if (depth >= carHeight) return limits.surfaceRise;
  return clamp(
    (depth - limits.floatDraft) * limits.floatGain,
    0,
    limits.surfaceRise,
  );
}
