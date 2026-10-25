import type { MotionLimits, TyreLimits } from "../../motion/limits";
import {
  clearanceHeight,
  type PlacementSurface,
} from "../../placement/placement";
import type { SeatLayout, VehicleProfile } from "../../profile";
import { CAMPER_SPEC } from "./spec";

// Deck seat 4 is the toilet seat in the shower-toilet at the rear right; it is never
// a vehicle seat, so nobody rides it while the camper moves (ADR 0095).
export const CAMPER_PARKED_SEATS: SeatLayout = Object.freeze({
  positions: Object.freeze([{ x: -1.031, z: -3.0 }]),
});

const body = Object.freeze({
  front: CAMPER_SPEC.bodyFront,
  halfWidth: CAMPER_SPEC.bodyHalfWidth,
  height: CAMPER_SPEC.carHeight,
});

export const CAMPER_PROFILE: VehicleProfile = Object.freeze({
  kind: "camper",
  fleetLimit: 1, // Per player (ADR 0066, 0067).
  body,
  footprint: CAMPER_SPEC.footprint,
  /**
   * x = left, z = forward. 0 = driver (front right, right-hand drive like the SUV),
   * 1 = front passenger, 2 = dinette facing the rear, 3 = dinette facing forward; the
   * dinette stays on the left, behind the passenger, clear of the door (ADR 0069).
   * Must match minecraft:rideable in packs/yasu_ride_bp/entities/yasu_ride/camper.se.json
   * (ADR 0019).
   */
  seats: Object.freeze({
    positions: Object.freeze([
      { x: -0.75, z: 2.1 },
      { x: 0.75, z: 2.1 },
      { x: 1.0, z: 1.0 },
      { x: 1.0, z: -1.0 },
    ]),
  }),
  parkedSeats: CAMPER_PARKED_SEATS,
  deckSeatDriverHeadlights: true,
  boarding: Object.freeze({ order: "engine" }),
  beams: Object.freeze({
    reach: CAMPER_SPEC.headlightReach,
    lanes: Object.freeze([0]),
  }),
  // The 3-wide collision box fits the same 3 x 3 cells as the SUV's. The 7.6-block body reaches
  // past them, so its ends can stand inside nearby blocks until the drive's end check
  // stops it (ADR 0143, superseding the 9 x 9 of ADR 0067).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["top"]),
    clearance: Object.freeze({
      halfX: 1,
      halfZ: 1,
      height: clearanceHeight(body),
    }),
  }),
  // The vanilla view from behind stays inside the 7.6-block body, which hides the camper
  // in flight (ADR 0071).
  chaseCamera: "far",
  defaultPaint: "khaki", // ADR 0067, 0076
  placementGift: "camping_gear_box", // ADR 0093
  // The camper's own hitbox is hidden in its floor; its bumper boxes stand on a stand-in
  // entity of their own, since an entity's boxes never turn with it (ADR 0116).
  standIn: Object.freeze({
    name: "camper_bumper",
    ahead: CAMPER_SPEC.bodyFront,
    turnMargin: CAMPER_SPEC.bumperTurnMargin,
    maxLift: CAMPER_SPEC.bumperMaxLift,
    parkedMaxLift: CAMPER_SPEC.bumperParkedMaxLift,
  }),
  // The camper takes hits only on its bumper boxes, so players need to be told where
  // to hit it and, once it is parked, how to take the wheel (ADR 0086).
  hints: Object.freeze({
    bumper: Object.freeze({
      boxXs: CAMPER_SPEC.bumperBoxXs,
      boxZ: CAMPER_SPEC.bodyFront,
      boxHalf: CAMPER_SPEC.bumperBoxSize / 2,
      bodyHalfWidth: CAMPER_SPEC.bodyHalfWidth,
      reach: CAMPER_SPEC.bumperHintReach,
      feet: CAMPER_SPEC.bumperHintFeet,
    }),
    driverSeat: Object.freeze({
      reach: CAMPER_SPEC.seatHintReach,
      feet: CAMPER_SPEC.seatHintFeet,
    }),
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
});

// Frozen because every camper drive shares this one object.
export const CAMPER_TYRES: TyreLimits = Object.freeze({
  handbrakeGrip: CAMPER_SPEC.handbrakeGrip,
  creepSpeed: CAMPER_SPEC.creepSpeed,
});
