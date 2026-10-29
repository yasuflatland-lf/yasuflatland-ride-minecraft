import type { MotionLimits, TyreLimits } from "../../motion/limits";
import {
  clearanceHeight,
  type PlacementSurface,
} from "../../placement/placement";
import type { VehicleProfile } from "../../profile";
import { BULLDOZER_MONITOR } from "./monitor";
import { BULLDOZER_SPEC, BULLDOZER_WIDE_BLADE } from "./spec";

const body = Object.freeze({
  front: BULLDOZER_SPEC.bodyFront,
  halfWidth: BULLDOZER_SPEC.bodyHalfWidth,
  height: BULLDOZER_SPEC.carHeight,
});
export const BULLDOZER_PROFILE: VehicleProfile = Object.freeze({
  kind: "bulldozer",
  fleetLimit: 1,
  body,
  maxRamHalfWidth: BULLDOZER_WIDE_BLADE.halfWidth,
  footprint: BULLDOZER_SPEC.footprint,
  seats: Object.freeze({ positions: Object.freeze([{ x: 0, z: -1.35 }]) }),
  boarding: Object.freeze({ order: "engine" }),
  seatExits: Object.freeze([BULLDOZER_SPEC.doorExit]),
  beams: Object.freeze({
    reach: BULLDOZER_SPEC.headlightReach,
    levels: BULLDOZER_SPEC.headlightLevels,
    lanes: Object.freeze([0]),
  }),
  // The 2.4-wide collision box fits the same 3 x 3 cells as the SUV's; the blade and tracks
  // are model only. 3 cells high hold the 2.9-high box (ADR 0142).
  placement: Object.freeze({
    surfaces: Object.freeze<PlacementSurface[]>(["top"]),
    clearance: Object.freeze({
      halfX: 1,
      halfZ: 1,
      height: clearanceHeight(body),
    }),
  }),
  chaseCamera: "far",
  defaultPaint: "yellow",
  monitor: BULLDOZER_MONITOR,
});
export const BULLDOZER_MOTION: MotionLimits = Object.freeze({
  maxSpeed: BULLDOZER_SPEC.maxSpeed,
  maxReverse: BULLDOZER_SPEC.maxReverse,
  accel: BULLDOZER_SPEC.accel,
  reverseAccel: BULLDOZER_SPEC.reverseAccel,
  brake: BULLDOZER_SPEC.brake,
  drag: BULLDOZER_SPEC.drag,
  turnRate: BULLDOZER_SPEC.turnRate,
  steerFullSpeed: BULLDOZER_SPEC.steerFullSpeed,
  grip: BULLDOZER_SPEC.grip,
});
// Read by stepMotion and stepMediumMotion but without effect: the bulldozer never creeps or handbrakes.
export const BULLDOZER_TYRES: TyreLimits = Object.freeze({
  handbrakeGrip: 1,
  creepSpeed: 0,
});
