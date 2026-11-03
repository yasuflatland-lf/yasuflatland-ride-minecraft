import type { Medium } from "../../motion/motion";
import type { TransformingSpec } from "../../motion/transforming";

// The tent owns its platform size; changing the vehicle must not resize it.
const ROOF_TENT_SHELL_HALF_WIDTH = 1.968;
// Conservative support inside the hardtop's CAB-based flat slab (ADR 0217).
const HARDTOP_HALF_WIDTH = (0.7 * (26.1 / 2.064) * 1.45) / 16;
const ROOF_TENT_ANCHOR_X = ROOF_TENT_SHELL_HALF_WIDTH - HARDTOP_HALF_WIDTH;
const ROOF_TENT_ANCHOR_Z =
  ((17.2 - ((1.16 + 3.44) / 2) * (26.1 / 2.064)) * 1.45) / 16;

// The SUV's own tuning values (ADR 0055). See docs/adr/0002-0008 for the rationale.
export const SUV_SPEC = Object.freeze({
  // Driving (ADR 0002)
  maxSpeed: 0.9, // blocks/tick
  maxReverse: 0.2,
  accel: 0.0225,
  reverseAccel: 0.01125,
  brake: 0.04,
  drag: 0.02,
  turnRate: 6, // degrees/tick at full steering input
  steerFullSpeed: 0.08, // Full steering effect at or above this speed
  grip: 0.6,
  handbrakeGrip: 0.04,
  creepSpeed: 0.12, // Below SPEC.ramMinSpeed, so creeping never rams (ADR 0006)
  // Steps (ADR 0004)
  hitboxFront: 1.34,
  carHeight: 2.36,
  // Collisions (ADR 0006)
  bodyFront: 2.68, // encloses the shell and lamps (ADR 0217)
  bodyHalfWidth: 1.43, // includes protruding wheel hubs in body and ram probes (ADR 0217)
  footprint: 3.18, // encloses all rotated corners, including folded hover glow and the extended axle (ADRs 0217, 0218)
  // ROOF_TOP scaled by SIZE_SCALE in tools/suv_dims.py, above the collision box.
  roofTentRoofHeight: (26.1 * 1.45) / 16,
  // Align the platform right edge with the hardtop; the left overhang clears the ladder.
  roofTentShellHalfWidth: ROOF_TENT_SHELL_HALF_WIDTH,
  roofTentHardtopHalfWidth: HARDTOP_HALF_WIDTH,
  roofTentAnchorX: ROOF_TENT_ANCHOR_X,
  roofTentAnchorZ: ROOF_TENT_ANCHOR_Z, // Center the platform on the hardtop span.
  roofTentLadder: true,
  // Profile x points left; match the model foot's pivot offset and outward run.
  roofTentEntranceX:
    ROOF_TENT_ANCHOR_X + ROOF_TENT_SHELL_HALF_WIDTH + (0.5 + 7.3) / 16,
  roofTentEntranceZ: ROOF_TENT_ANCHOR_Z - 6 / 16,
  // Headlights (ADR 0020)
  headlightReach: Object.freeze([4, 9, 15, 21, 27] as const), // blocks ahead of the vehicle's center, one light block each; 6 apart, the road surface between them stays at level 9 or brighter (ADR 0024)
  // Flight (ADR 0021)
  doubleTapTicks: 8, // A second Jump press within this many ticks toggles flight
  takeoffTicks: 20,
  takeoffClimb: 0.075, // blocks/tick; 20 ticks lift the vehicle 1.5 blocks
  landingSink: 0.15, // blocks/tick
  maxClimb: 0.3, // blocks/tick, up or down, with Jump held or the stick pulled back (ADR 0032)
  // Engine drag per tick with gravity off. The flight_cruise in-game test
  // reports the measured horizontal value.
  flightDrag: 0.91,
  flightVerticalDrag: 0.98,
  // Submarine (ADR 0040)
  maxWaterSpeed: 0.5, // blocks/tick
  // Engine drag per tick in water with gravity off, as the submarine_dive
  // in-game test measured it (0.833 horizontal, 0.836 vertical).
  waterDrag: 0.83,
  waterVerticalDrag: 0.84,
  floatDraft: 1.77, // preserves the three-quarter-height float line (ADR 0217).
  // A floating submarine's feet sit fractionally into a shore step, so the
  // step top can be less than the half block above the feet where stepUp.ts
  // probes. Lowering the probe by this much starts it at the feet.
  submarineStepProbeDrop: 0.5, // blocks
  surfaceRise: 0.05, // blocks/tick; caps buoyancy both up and down
  floatGain: 0.25, // blocks/tick of buoyancy per block of depth off the float line
  // Banking in flight (ADR 0026) and under water (ADR 0044)
  maxBank: 30, // degrees at the full turn rate
  bankRate: 3, // nominal degrees/tick; smooth easing reaches full bank in 11 ticks
  // Landing gear (ADR 0033). Unfolding takes 1 s (ADR 0022), 3 blocks of
  // landing at landingSink, so the wheels come down a block above that.
  gearDownHeight: 4, // blocks of air below the vehicle within which landing unfolds the wheels
  gearProbeOffset: 1.34 * (1 - 0.1 / 0.9), // keeps the probes inside the collision box (ADR 0217)
  bankSink: 0.03, // blocks/tick of altitude lost at full bank
} as const);

export const AIR: Medium = Object.freeze({
  drag: SUV_SPEC.flightDrag,
  maxSpeed: SUV_SPEC.maxSpeed,
});
export const WATER: Medium = Object.freeze({
  drag: SUV_SPEC.waterDrag,
  maxSpeed: SUV_SPEC.maxWaterSpeed,
});

// The SUV's values for the shared transforming drivetrain (ADR 0050).
export const SUV_TRANSFORMING: TransformingSpec = Object.freeze({
  carHeight: SUV_SPEC.carHeight,
  doubleTapTicks: SUV_SPEC.doubleTapTicks,
  takeoffTicks: SUV_SPEC.takeoffTicks,
  takeoffClimb: SUV_SPEC.takeoffClimb,
  landingSink: SUV_SPEC.landingSink,
  maxClimb: SUV_SPEC.maxClimb,
  flightVerticalDrag: SUV_SPEC.flightVerticalDrag,
  waterVerticalDrag: SUV_SPEC.waterVerticalDrag,
  floatDraft: SUV_SPEC.floatDraft,
  floatGain: SUV_SPEC.floatGain,
  surfaceRise: SUV_SPEC.surfaceRise,
  submarineStepProbeDrop: SUV_SPEC.submarineStepProbeDrop,
  maxBank: SUV_SPEC.maxBank,
  bankRate: SUV_SPEC.bankRate,
  bankEasing: "smooth",
  bankSink: SUV_SPEC.bankSink,
  gearDownHeight: SUV_SPEC.gearDownHeight,
  gearProbeOffset: SUV_SPEC.gearProbeOffset,
  hitboxFront: SUV_SPEC.hitboxFront,
  air: AIR,
  water: WATER,
});
