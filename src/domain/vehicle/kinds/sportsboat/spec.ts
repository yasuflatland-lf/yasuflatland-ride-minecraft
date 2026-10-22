// The sports boat's own tuning values (ADR 0051, ADR 0087), written out even where they equal the SUV's today.
export const SPORTSBOAT_SPEC = Object.freeze({
  // Driving (ADR 0051)
  maxSpeed: 1.12, // ADR 0051
  maxReverse: 0.2, // ADR 0051
  accel: 0.0225, // ADR 0051
  reverseAccel: 0.01125, // Half of accel, as on land
  brake: 0.04,
  drag: 0.02,
  turnRate: 6, // degrees/tick at full steering input (ADR 0051)
  steerFullSpeed: 0.08,
  grip: 0.6,
  creepSpeed: 0.12, // Below SPEC.ramMinSpeed, so creeping never rams (ADR 0006)
  // Body
  // The height of the sportsboat collision box, which bounds the water depth
  // query; the boat only tests whether the depth is above zero.
  height: 1.2,
  ramFront: 3.0, // ADR 0051
  ramHalfWidth: 1.06, // ADR 0051
  footprint: 3.5, // the farthest hull corner, at the stern, is 3.48 from the center in sportsboat.geo.json (ADR 0122)
  // Water drag estimate (ADR 0053): boat_drag measured 0.833 at full speed,
  // 0.916-0.927 on the 3 ticks of every 14 at the top of the bob, and 0.815
  // the tick after; weight 0.1 keeps one bump to about +0.02 on the estimate.
  waterDragInitial: 0.83,
  waterDragMin: 0.7,
  waterDragMax: 0.95,
  waterDragSmoothing: 0.1,
  waterDragMinGiven: 0.05,
  // Attitude (ADR 0059, ADR 0061, ADR 0085)
  /**
   * Degrees of bow rise while the forward speed grows by a full `accel` per
   * tick (the drive's limits). The owner found 7 too high (ADR 0085).
   */
  maxTrim: 3.5,
  /** Degrees per tick toward a higher trim, so the bow lifts in about 0.7 s. */
  trimRiseRate: 0.25,
  /** Degrees per tick toward a lower trim, so the bow settles in about 1.4 s. */
  trimSettleRate: 0.125,
  /** Degrees of roll in a turn at the full turn rate and top speed (ADR 0061). */
  maxRoll: 20,
  /** Degrees per tick, so a full roll builds up in half a second (ADR 0061). */
  rollRate: 2,
  // Deck (ADR 0063)
  /** Measured mean draft at rest, in blocks. */
  deckDraft: 0.45,
  /** A 0.3-block margin covered 13 to 16 cells in the spike. */
  deckMargin: 0.3,
} as const);
