import type { Medium } from "../../motion/motion";
import type { TransformingSpec } from "../../motion/transforming";

// The camper's own tuning values (ADR 0067). Values marked "as the SUV" repeat the SUV's
// numbers because the owner asked for the same behavior; they are not shared constants.
export const CAMPER_SPEC = {
  // Driving (ADR 0002, 0067)
  maxSpeed: 0.9, // blocks/tick, as the SUV (owner's choice)
  maxReverse: 0.15,
  accel: 0.012, // 0.9 / 0.012 = 75 ticks, about 3.75 s to full speed at 20 tps; about half the SUV's 0.0225, for a heavy body
  reverseAccel: 0.006,
  brake: 0.04, // as the SUV
  drag: 0.02, // as the SUV
  turnRate: 4, // degrees/tick; a long body turns slower than the SUV's 6
  steerFullSpeed: 0.08, // as the SUV
  grip: 0.6, // as the SUV
  handbrakeGrip: 0.04, // as the SUV
  creepSpeed: 0.12, // as the SUV; below SPEC.ramMinSpeed (ADR 0006)
  // Body (model units / 16, tools/gen_camper.py)
  carHeight: 4.0, // the roof, 64 px up
  hitboxFront: 1.5, // the collision box's front; the step probe lifts the box, not the nose (ADR 0004)
  bodyFront: 3.7, // the front bumper
  bodyRear: 3.9, // the rear ladder
  bodyHalfWidth: 1.5, // the tires' outer faces
  headlightReach: [4, 9, 15, 21, 27], // as the SUV (ADR 0020)
  // Flight (ADR 0021, 0032), as the SUV
  doubleTapTicks: 8,
  takeoffTicks: 20,
  takeoffClimb: 0.075,
  landingSink: 0.15,
  maxClimb: 0.3,
  flightDrag: 0.91,
  flightVerticalDrag: 0.98,
  // Submarine (ADR 0040), as the SUV except the draft
  maxWaterSpeed: 0.5,
  waterDrag: 0.83,
  waterVerticalDrag: 0.84,
  floatDraft: 3.6, // leaves 0.4 blocks of roof above the surface, as the SUV's 1.2 of 1.6
  submarineStepProbeDrop: 0.5,
  surfaceRise: 0.05,
  floatGain: 0.25,
  // Bank and landing gear (ADR 0026, 0033, 0044), as the SUV except the probe offset
  maxBank: 30,
  bankRate: 3,
  gearDownHeight: 4,
  gearProbeOffset: 1.2, // inside the 3-wide collision box, as the SUV's 0.8 inside 1.8
  bankSink: 0.03,
} as const;

export const CAMPER_AIR: Medium = {
  drag: CAMPER_SPEC.flightDrag,
  maxSpeed: CAMPER_SPEC.maxSpeed,
};
export const CAMPER_WATER: Medium = {
  drag: CAMPER_SPEC.waterDrag,
  maxSpeed: CAMPER_SPEC.maxWaterSpeed,
};

export const CAMPER_TRANSFORMING: TransformingSpec = Object.freeze({
  carHeight: CAMPER_SPEC.carHeight,
  doubleTapTicks: CAMPER_SPEC.doubleTapTicks,
  takeoffTicks: CAMPER_SPEC.takeoffTicks,
  takeoffClimb: CAMPER_SPEC.takeoffClimb,
  landingSink: CAMPER_SPEC.landingSink,
  maxClimb: CAMPER_SPEC.maxClimb,
  flightVerticalDrag: CAMPER_SPEC.flightVerticalDrag,
  waterVerticalDrag: CAMPER_SPEC.waterVerticalDrag,
  floatDraft: CAMPER_SPEC.floatDraft,
  floatGain: CAMPER_SPEC.floatGain,
  surfaceRise: CAMPER_SPEC.surfaceRise,
  submarineStepProbeDrop: CAMPER_SPEC.submarineStepProbeDrop,
  maxBank: CAMPER_SPEC.maxBank,
  bankRate: CAMPER_SPEC.bankRate,
  bankSink: CAMPER_SPEC.bankSink,
  gearDownHeight: CAMPER_SPEC.gearDownHeight,
  gearProbeOffset: CAMPER_SPEC.gearProbeOffset,
  hitboxFront: CAMPER_SPEC.hitboxFront,
  air: CAMPER_AIR,
  water: CAMPER_WATER,
});
