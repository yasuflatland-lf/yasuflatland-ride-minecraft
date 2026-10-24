import { MOTION } from "../../motion/constants";
import type { Medium } from "../../motion/motion";
import type { TransformingSpec } from "../../motion/transforming";
export interface BladeRule {
  readonly near: number;
  readonly far: number;
  readonly halfWidth: number;
  readonly bodyHeight: number;
  readonly minSpeed: number;
}
export interface TrackGeometry {
  readonly halfGauge: number;
  readonly phaseStep: number;
  readonly radius: number;
}
// Flight and water values repeat the SUV's at the owner's request for the same behavior; they are not shared constants (ADR 0050, 0136).
export const BULLDOZER_SPEC = Object.freeze({
  maxSpeed: 0.45,
  accel: 0.01125,
  brake: 0.02,
  drag: 0.01,
  maxReverse: 0.1,
  reverseAccel: 0.005625,
  turnRate: 3,
  pivotStick: 0.35,
  grip: 1,
  // Read by steerYaw but without effect: the bulldozer never steers while driving.
  steerFullSpeed: 0.08,
  hopVelocity: MOTION.oneStepVelocity,
  hopTicks: MOTION.stepTicks,
  carHeight: 2.9,
  hitboxFront: 1.2,
  footprint: 3.35,
  // The blade's front-most point, -38.4 px / 16. The body ends at 2.04, so the ram box covers the blade.
  bodyFront: 2.4,
  // The blade's half width, 37.05 px / 16, rather than the 1.18-block cab. The ram box covers the full blade.
  bodyHalfWidth: 2.32,
  doubleTapTicks: 8,
  takeoffTicks: 20,
  takeoffClimb: 0.075,
  landingSink: 0.15,
  maxClimb: 0.3,
  flightDrag: 0.91,
  flightVerticalDrag: 0.98,
  // stepMediumMotion caps speed at Math.min(limits.maxSpeed, medium.maxSpeed).
  // BULLDOZER_MOTION.maxSpeed makes the effective water and flight cap 0.45; 0.5 matches the SUV.
  maxWaterSpeed: 0.5,
  waterDrag: 0.83,
  waterVerticalDrag: 0.84,
  floatDraft: 2.5,
  floatGain: 0.25,
  surfaceRise: 0.05,
  submarineStepProbeDrop: 0.5,
  gearDownHeight: 4,
  gearProbeOffset: 1.0,
  maxBank: 0,
  bankRate: 3,
  bankSink: 0.03,
  doorOpenTicks: 40,
  doorSteps: 10,
  // Beside the left door, outside the track (outer edge 18.8/16) by a player's half width
  // (0.3) and a margin, clear of the open door's edge (about x 1.01) and behind the blade (ADR 0141).
  doorExit: Object.freeze({ x: 1.75, z: -0.7 }),
  // Ticks the blade takes to travel fully up or down; the rig animation follows the property (ADR 0138).
  bladeLiftTicks: 10,
  // A placed bulldozer starts raised, so it climbs steps and cuts nothing until the driver lowers it (ADR 0138).
  // Keep in step with the yasu_ride:blade default (1.0) in bulldozer.se.json.
  bladeRaisedOnSpawn: true,
  headlightReach: Object.freeze([6, 10, 15, 21, 27] as const),
  headlightLevels: Object.freeze([8, 12, 15, 15, 15] as const),
  blade: Object.freeze({
    near: 1.0,
    far: 2.9,
    halfWidth: 2.32,
    bodyHeight: 2.9,
    minSpeed: 0.02,
  }),
  tracks: Object.freeze({
    halfGauge: 14.3 / 16,
    phaseStep: 1.5 / 16 / 3,
    radius: 6.7 / 16,
  }),
} as const);
export const BULLDOZER_AIR: Medium = Object.freeze({
  drag: BULLDOZER_SPEC.flightDrag,
  maxSpeed: BULLDOZER_SPEC.maxSpeed,
});
export const BULLDOZER_WATER: Medium = Object.freeze({
  drag: BULLDOZER_SPEC.waterDrag,
  maxSpeed: BULLDOZER_SPEC.maxWaterSpeed,
});
export const BULLDOZER_TRANSFORMING: TransformingSpec = Object.freeze({
  carHeight: BULLDOZER_SPEC.carHeight,
  doubleTapTicks: BULLDOZER_SPEC.doubleTapTicks,
  takeoffTicks: BULLDOZER_SPEC.takeoffTicks,
  takeoffClimb: BULLDOZER_SPEC.takeoffClimb,
  landingSink: BULLDOZER_SPEC.landingSink,
  maxClimb: BULLDOZER_SPEC.maxClimb,
  flightVerticalDrag: BULLDOZER_SPEC.flightVerticalDrag,
  waterVerticalDrag: BULLDOZER_SPEC.waterVerticalDrag,
  floatDraft: BULLDOZER_SPEC.floatDraft,
  floatGain: BULLDOZER_SPEC.floatGain,
  surfaceRise: BULLDOZER_SPEC.surfaceRise,
  submarineStepProbeDrop: BULLDOZER_SPEC.submarineStepProbeDrop,
  maxBank: BULLDOZER_SPEC.maxBank,
  bankRate: BULLDOZER_SPEC.bankRate,
  bankSink: BULLDOZER_SPEC.bankSink,
  gearDownHeight: BULLDOZER_SPEC.gearDownHeight,
  gearProbeOffset: BULLDOZER_SPEC.gearProbeOffset,
  hitboxFront: BULLDOZER_SPEC.hitboxFront,
  air: BULLDOZER_AIR,
  water: BULLDOZER_WATER,
});
