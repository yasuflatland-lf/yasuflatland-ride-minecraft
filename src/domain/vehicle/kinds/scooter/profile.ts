import { dyeable } from "../../../shared/paint";
import { motionLimitsOf, tyreLimitsOf } from "../../motion/limits";
import {
  clearanceHeight,
  type PlacementLiquid,
  type PlacementSurface,
} from "../../placement/placement";
import type { VehicleProfile } from "../../profile";
import { SCOOTER_SPEC } from "./spec";

const body = Object.freeze({
  front: SCOOTER_SPEC.bodyFront,
  halfWidth: SCOOTER_SPEC.bodyHalfWidth,
  height: SCOOTER_SPEC.carHeight,
});

const driverSeatPose = Object.freeze({
  grip: "scooter_grip",
  lean: Object.freeze([
    "scooter_lean_l5",
    "scooter_lean_l4",
    "scooter_lean_l3",
    "scooter_lean_l2",
    "scooter_lean_l1",
    "scooter_lean_r1",
    "scooter_lean_r2",
    "scooter_lean_r3",
    "scooter_lean_r4",
    "scooter_lean_r5",
  ]),
});

const passengerSeatPose = Object.freeze({
  grip: "scooter_pillion_grip",
  lean: Object.freeze([
    "scooter_pillion_lean_l5",
    "scooter_pillion_lean_l4",
    "scooter_pillion_lean_l3",
    "scooter_pillion_lean_l2",
    "scooter_pillion_lean_l1",
    "scooter_pillion_lean_r1",
    "scooter_pillion_lean_r2",
    "scooter_pillion_lean_r3",
    "scooter_pillion_lean_r4",
    "scooter_pillion_lean_r5",
  ]),
});

export const SCOOTER_PROFILE: VehicleProfile = Object.freeze({
  kind: "scooter",
  ridersFireProof: false,
  riderPose: Object.freeze({
    seats: Object.freeze([driverSeatPose, passengerSeatPose]),
    refreshTicks: SCOOTER_SPEC.riderPoseRefreshTicks,
  }),
  fleetLimit: SCOOTER_SPEC.fleetLimit,
  body,
  footprint: SCOOTER_SPEC.footprint,
  ramMinReverseSpeed: SCOOTER_SPEC.ramMinReverseSpeed,
  seats: Object.freeze({
    positions: Object.freeze([
      Object.freeze({ x: 0, z: SCOOTER_SPEC.driverSeatZ }),
      Object.freeze({ x: 0, z: SCOOTER_SPEC.passengerSeatZ }),
    ]),
  }),
  boarding: Object.freeze({ order: "engine" }),
  beams: Object.freeze({
    reach: SCOOTER_SPEC.headlightReach,
    lanes: Object.freeze([0]),
  }),
  placement: Object.freeze({
    liquids: Object.freeze(new Set<PlacementLiquid>()),
    surfaces: Object.freeze<PlacementSurface[]>(["top"]),
    clearance: Object.freeze({
      halfX: Math.ceil(SCOOTER_SPEC.hitboxFront),
      halfZ: Math.ceil(SCOOTER_SPEC.hitboxFront),
      height: clearanceHeight(body),
    }),
  }),
  chaseCamera: "near",
  paintPolicy: Object.freeze(dyeable("white")),
});

export const SCOOTER_MOTION = motionLimitsOf(SCOOTER_SPEC);
export const SCOOTER_TYRES = tyreLimitsOf(SCOOTER_SPEC);
