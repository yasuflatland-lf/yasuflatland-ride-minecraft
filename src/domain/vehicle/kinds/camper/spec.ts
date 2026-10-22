import type { Medium } from "../../motion/motion";
import type { TransformingSpec } from "../../motion/transforming";

// The camper's own tuning values (ADR 0067). Values marked "as the SUV" repeat the SUV's
// numbers because the owner asked for the same behavior; they are not shared constants.
export const CAMPER_SPEC = Object.freeze({
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
  // The farthest corner: the body reaches 4.14 in camper.geo.json, and the outer bumper
  // stand-in boxes reach hypot(1.5, 3.7 + 0.5) = 4.46 (ADR 0116, 0122)
  footprint: 4.5,
  headlightReach: Object.freeze([4, 9, 15, 21, 27] as const), // as the SUV (ADR 0020)
  // Bumper hitboxes (ADR 0084, 0116): 1 x 1 x 1 boxes side by side across the heading at
  // bodyFront, on the bumper stand-in entity, x from the row's middle
  bumperBoxXs: [-1, 0, 1],
  bumperBoxY: 0.5, // the box center; the boxes span the bottom block of the body
  bumperBoxSize: 1,
  // Degrees past the 45-degree line before a turning camper's bumper stand-in swaps to the
  // other row axis, so steering along a diagonal does not respawn it every tick (ADR 0116)
  bumperTurnMargin: 5,
  // The car form's step probe climbs layers 0 and 1, so the nose can stop over a rise of up
  // to two blocks; the stand-in rises over that much ground under its middle box (ADR 0119)
  bumperMaxLift: 2,
  // Parked, the middle box stands in the front end wall's column: parking accepts ground
  // only in its foot, and the dock's wall blocks above would read as more ground (ADR 0119)
  bumperParkedMaxLift: 1,
  // The camper's own hitbox: a cube this wide and high on its feet, inside the parked floor
  // block under its center, so no tap reaches the camper itself (ADR 0116)
  hiddenHitboxSize: 0.1,
  // Hints (ADR 0086), in blocks
  bumperHintReach: 1.5,
  bumperHintFeet: [-1, 1.5], // from the ground in front of the bumper up to standing on a 1-block step
  seatHintReach: 1.5,
  seatHintFeet: [0.5, 3.5], // on the parked room's floor, below its roof (ADR 0068)
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
  // Doors (ADR 0068, 0094, 0105)
  doorSwingTicks: 10, // one step of 0.1 per tick: half a second
  // Shower-toilet (ADR 0094)
  showerTicks: 100, // 5 s at 20 ticks per second
  // Decor (ADR 0097)
  seatPressIdleTicks: 10, // a held touch repeats every 4-6 ticks on mobile (ADR 0024)
} as const);

export const CAMPER_AIR: Medium = Object.freeze({
  drag: CAMPER_SPEC.flightDrag,
  maxSpeed: CAMPER_SPEC.maxSpeed,
});
export const CAMPER_WATER: Medium = Object.freeze({
  drag: CAMPER_SPEC.waterDrag,
  maxSpeed: CAMPER_SPEC.maxWaterSpeed,
});

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
