import type { Medium } from "../../motion/motion";
import type { TransformingSpec } from "../../motion/transforming";

// The scooter's own tuning values (ADR 0055); ground speeds are copies of the SUV's numbers, not imports (ADR 0050).
export const SCOOTER_SPEC = Object.freeze({
  maxSpeed: 0.9,
  maxReverse: 0.2,
  ramMinReverseSpeed: 0.15, // blocks/tick; rams only while reversing faster than this (ADR 0006)
  accel: 0.0225,
  reverseAccel: 0.01125,
  brake: 0.04,
  drag: 0.02,
  turnRate: 6,
  steerFullSpeed: 0.08,
  grip: 0.6,
  handbrakeGrip: 0.04,
  creepSpeed: 0.12,
  // Conservative envelopes of the frozen 1.25x spike, already in pixels.
  // These dimensions and seat locators must match tools/scooter_dims.py.
  hitboxFront: 6.5 / 16,
  carHeight: 25 / 16,
  bodyFront: 19 / 16,
  bodyHalfWidth: 6.5 / 16,
  footprint: 1.3,
  driverSeatZ: -3.5 / 16,
  passengerSeatZ: -9.5 / 16,
  fleetLimit: 10,
  headlightReach: Object.freeze([4, 9, 15, 21, 27] as const),
  doubleTapTicks: 8,
  takeoffTicks: 20,
  takeoffClimb: 0.075,
  landingSink: 0.15,
  maxClimb: 0.3,
  flightDrag: 0.91,
  flightVerticalDrag: 0.98,
  maxWaterSpeed: 0.9,
  waterDrag: 0.83,
  waterVerticalDrag: 0.84,
  floatDraft: 0.4,
  submarineStepProbeDrop: 0.5,
  surfaceRise: 0.05,
  floatGain: 0.25,
  maxBank: 30,
  bankRate: 3,
  gearDownHeight: 4,
  gearProbeOffset: 0.3,
  bankSink: 0.03,
  stepLaneOffset: 0.25, // inside bodyHalfWidth so the side lanes never probe past the narrow body
  maxLean: 20, // degrees of body lean at full steering and leanFullSpeed
  leanRate: 2, // degrees/tick
  leanFullSpeed: 0.3, // blocks/tick; slower turns lean proportionally less
  maxSteer: 30, // degrees of handlebar turn about the steering axis
  // Late joiners see the pose within a second, matching the beach chair poseRefreshTicks.
  riderPoseRefreshTicks: 20,
  // Stepped rider poses per side; players cannot read the lean property (ADR 0238).
  // Degrees of total body roll (lean - bank): three steps fit the ground range
  // (maxLean 20), the last equals maxLean + maxBank. The Resource Pack's lean animations use these angles.
  rollLevelAngles: Object.freeze([7, 14, 20, 35, 50] as const),
  standSpeed: 0.01, // blocks/tick below which the scooter counts as stopped
} as const);

export const SCOOTER_AIR: Medium = Object.freeze({
  drag: SCOOTER_SPEC.flightDrag,
  maxSpeed: SCOOTER_SPEC.maxSpeed,
});
export const SCOOTER_WATER: Medium = Object.freeze({
  drag: SCOOTER_SPEC.waterDrag,
  maxSpeed: SCOOTER_SPEC.maxWaterSpeed,
});

export const SCOOTER_TRANSFORMING: TransformingSpec = Object.freeze({
  carHeight: SCOOTER_SPEC.carHeight,
  doubleTapTicks: SCOOTER_SPEC.doubleTapTicks,
  takeoffTicks: SCOOTER_SPEC.takeoffTicks,
  takeoffClimb: SCOOTER_SPEC.takeoffClimb,
  landingSink: SCOOTER_SPEC.landingSink,
  maxClimb: SCOOTER_SPEC.maxClimb,
  flightVerticalDrag: SCOOTER_SPEC.flightVerticalDrag,
  waterVerticalDrag: SCOOTER_SPEC.waterVerticalDrag,
  floatDraft: SCOOTER_SPEC.floatDraft,
  floatGain: SCOOTER_SPEC.floatGain,
  surfaceRise: SCOOTER_SPEC.surfaceRise,
  submarineStepProbeDrop: SCOOTER_SPEC.submarineStepProbeDrop,
  maxBank: SCOOTER_SPEC.maxBank,
  bankRate: SCOOTER_SPEC.bankRate,
  bankSink: SCOOTER_SPEC.bankSink,
  gearDownHeight: SCOOTER_SPEC.gearDownHeight,
  gearProbeOffset: SCOOTER_SPEC.gearProbeOffset,
  hitboxFront: SCOOTER_SPEC.hitboxFront,
  stepLaneOffset: SCOOTER_SPEC.stepLaneOffset,
  bankEasing: "smooth",
  air: SCOOTER_AIR,
  water: SCOOTER_WATER,
  waterPolicy: "surface",
});
