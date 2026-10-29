import { ramHalfWidthLimit, type VehicleProfile } from "./profile";
import { SPEC } from "./spec";

const RAM_HEIGHT_REACH = Math.max(
  Math.abs(SPEC.ramMinDy),
  Math.abs(SPEC.ramMaxDy),
);

/**
 * Reaches the far corners of every profile's ram hit box at either height
 * bound and its maximum ram half width, so every drive-reported width is
 * covered by the world query (ADR 0006, 0180).
 */
export function ramQueryRadius(profiles: readonly VehicleProfile[]): number {
  return Math.max(
    ...profiles.map((profile) =>
      Math.hypot(
        profile.body.front + SPEC.targetHalfWidth,
        ramHalfWidthLimit(profile) + SPEC.targetHalfWidth,
        RAM_HEIGHT_REACH,
      ),
    ),
  );
}
