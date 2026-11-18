import { dyeable } from "../../../shared/paint";
import type { MotionLimits, TyreLimits } from "../../motion/limits";
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

const riderSeatPose = Object.freeze({
  grip: "scooter_grip",
  lean: Object.freeze([
    "scooter_lean_l3",
    "scooter_lean_l2",
    "scooter_lean_l1",
    "scooter_lean_r1",
    "scooter_lean_r2",
    "scooter_lean_r3",
  ]),
});

export const SCOOTER_PROFILE: VehicleProfile = Object.freeze({
  kind: "scooter",
  ridersFireProof: false,
  riderPose: Object.freeze({
    seats: Object.freeze([riderSeatPose, riderSeatPose]),
    refreshTicks: SCOOTER_SPEC.riderPoseRefreshTicks,
  }),
  fleetLimit: SCOOTER_SPEC.fleetLimit,
  body,
  footprint: SCOOTER_SPEC.footprint,
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

export const SCOOTER_MOTION: MotionLimits = Object.freeze({
  maxSpeed: SCOOTER_SPEC.maxSpeed,
  maxReverse: SCOOTER_SPEC.maxReverse,
  accel: SCOOTER_SPEC.accel,
  reverseAccel: SCOOTER_SPEC.reverseAccel,
  brake: SCOOTER_SPEC.brake,
  drag: SCOOTER_SPEC.drag,
  turnRate: SCOOTER_SPEC.turnRate,
  steerFullSpeed: SCOOTER_SPEC.steerFullSpeed,
  grip: SCOOTER_SPEC.grip,
});
export const SCOOTER_TYRES: TyreLimits = Object.freeze({
  handbrakeGrip: SCOOTER_SPEC.handbrakeGrip,
  creepSpeed: SCOOTER_SPEC.creepSpeed,
});
