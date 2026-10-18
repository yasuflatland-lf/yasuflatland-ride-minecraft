import type { PlacementSurface } from "../../placement";
import type { MotionLimits, VehicleProfile } from "../../profile";
import { CAMPER_SPEC } from "./spec";

export const CAMPER_PROFILE: VehicleProfile = Object.freeze({
  kind: "camper",
  fleetLimit: 1, // Per player (ADR 0066, 0067).
  ram: Object.freeze({
    front: CAMPER_SPEC.bodyFront,
    halfWidth: CAMPER_SPEC.bodyHalfWidth,
  }),
  /**
   * x = left, z = forward. 0 = driver (front left, left-hand drive), 1 = front passenger,
   * 2 = dinette facing the rear, 3 = dinette facing forward. Must match minecraft:rideable
   * in packs/yasu_ride_bp/entities/yasu_ride/camper.se.json (ADR 0019).
   */
  seats: Object.freeze({
    positions: Object.freeze([
      { x: 0.75, z: 2.1 },
      { x: -0.75, z: 2.1 },
      { x: 1.0, z: 1.0 },
      { x: 1.0, z: -1.0 },
    ]),
  }),
  beams: Object.freeze({
    reach: CAMPER_SPEC.headlightReach,
    lanes: Object.freeze([0]),
  }),
  // The clearance is axis-aligned and the camper can face any way, so a 7 x 7 square
  // covers its 3 x 7 body in every facing (ADR 0067).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["top"]),
    clearance: Object.freeze({ halfX: 3, halfZ: 3, height: 4 }),
  }),
});

export const CAMPER_MOTION: MotionLimits = Object.freeze({
  maxSpeed: CAMPER_SPEC.maxSpeed,
  maxReverse: CAMPER_SPEC.maxReverse,
  accel: CAMPER_SPEC.accel,
  reverseAccel: CAMPER_SPEC.reverseAccel,
  brake: CAMPER_SPEC.brake,
  drag: CAMPER_SPEC.drag,
  turnRate: CAMPER_SPEC.turnRate,
  steerFullSpeed: CAMPER_SPEC.steerFullSpeed,
  grip: CAMPER_SPEC.grip,
  handbrakeGrip: CAMPER_SPEC.handbrakeGrip,
  creepSpeed: CAMPER_SPEC.creepSpeed,
});
