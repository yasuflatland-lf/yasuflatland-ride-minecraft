import type { MotionLimits } from "../../motion/limits";
import type { PlacementSurface } from "../../placement";
import type { VehicleProfile } from "../../profile";
import { SPORTSBOAT_SPEC } from "./spec";

/** The sports boat's own values (ADR 0051), written out even where they equal the SUV's today. */
export const SPORTSBOAT_PROFILE: VehicleProfile = Object.freeze({
  kind: "sportsboat",
  fleetLimit: 1, // Per player (ADR 0066).
  ram: Object.freeze({
    front: SPORTSBOAT_SPEC.ramFront,
    halfWidth: SPORTSBOAT_SPEC.ramHalfWidth,
  }),
  // Must match minecraft:rideable in packs/yasu_ride_bp/entities/yasu_ride/sportsboat.se.json; the SUV's x/z, no doors (ADR 0051).
  seats: Object.freeze({
    positions: Object.freeze([
      { x: -0.38, z: 0.35 },
      { x: 0.38, z: 0.35 },
      { x: -0.38, z: -0.8 },
      { x: 0.38, z: -0.8 },
    ]),
  }),
  // Every 4 blocks from 4 to 60 ahead, in two beams 3 blocks either side of the center line (ADR 0051).
  beams: Object.freeze({
    reach: Object.freeze([
      4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60,
    ]),
    lanes: Object.freeze([-3, 3]),
  }),
  // At the water surface from the bed, the water, or the side of a shore; on land from a top face (ADR 0051).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["water", "top"]),
    // 3 × 2 × 3 cells fit the 2.2-wide, 1.2-high collision box (ADR 0051).
    clearance: Object.freeze({ halfX: 1, halfZ: 1, height: 2 }),
  }),
  chaseCamera: "near",
  defaultPaint: "black", // ADR 0051, 0076
});

/** The sports boat's motion limits, read from SPORTSBOAT_SPEC (ADR 0087). */
export const SPORTSBOAT_MOTION: MotionLimits = Object.freeze({
  maxSpeed: SPORTSBOAT_SPEC.maxSpeed,
  maxReverse: SPORTSBOAT_SPEC.maxReverse,
  accel: SPORTSBOAT_SPEC.accel,
  reverseAccel: SPORTSBOAT_SPEC.reverseAccel,
  brake: SPORTSBOAT_SPEC.brake,
  drag: SPORTSBOAT_SPEC.drag,
  turnRate: SPORTSBOAT_SPEC.turnRate,
  steerFullSpeed: SPORTSBOAT_SPEC.steerFullSpeed,
  grip: SPORTSBOAT_SPEC.grip,
});
