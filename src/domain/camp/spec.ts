// Every tuning value of the low chair (ADR 0121).
export const CHAIR_SPEC = Object.freeze({
  /** The chair turns to face the player in steps of this many degrees. */
  yawStep: 45,
  /** Air blocks needed above the clicked block: the chair, then a seated player's head. */
  clearance: 2,
  /** Hits in a row that fold the chair back into its item, as for vehicles (ADR 0008). */
  hitsToTakeBack: 3,
  /** A gap longer than this, in ticks, starts the hit count again. */
  hitResetTicks: 100,
});
