// Tuning values the shared motion functions read (ADR 0055). See docs/adr/0002-0008 for the rationale.
export const MOTION = {
  mountAlignSpeed: 0.01, // Below this speed, align the vehicle with the driver's view on entry
  // Friction and walls (ADR 0003)
  defaultFriction: 0.69,
  frictionMin: 0.2, // Lowest surface the estimate learns (ADR 0082)
  frictionMax: 1,
  frictionEma: 0.2,
  airFriction: 0.91,
  airControl: 0.2,
  blockedAxisMin: 0.03,
  blockedRatio: 0.5,
  // Below this heading component along a wall, about 3 degrees from head-on,
  // a vehicle stops at the wall instead of sliding along it (ADR 0081).
  wallSlideMinCos: 0.05,
  // The engine zeroes a walled axis, so a kept ratio this low means a wall,
  // not a slow surface (ADR 0082).
  wallKeptMax: 0.15,
  // A uniform slow surface keeps the same ratio on every driven axis, up to
  // float rounding: 1 ulp in the script's float64, about 1e-7 relative after
  // the engine's float32 velocity. Ratios this close (relative) agree, so they
  // are a surface, not a wall (ADR 0082, #340).
  axisRatioTie: 1e-6,
  minExpectedForFriction: 0.05,
  // Steps (ADR 0004)
  stepVelocity: 0.75,
  oneStepVelocity: 0.45, // Peaks about 1.4 blocks up; 0.42, a player's jump, peaks at 1.25 (ADR 0035)
  stepTicks: 10,
  stepMinSpeed: 0.15,
  stepLookaheadTicks: 4,
  stepLookaheadMargin: 0.3,
  stepLaneOffset: 0.8,
  stepScanStep: 0.2,
} as const;
