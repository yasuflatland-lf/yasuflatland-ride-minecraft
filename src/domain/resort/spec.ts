import type { Paint } from "../shared/paint";

// Every tuning value of the beach parasol. The dimensions come from the model in
// tools/gen_beach_parasol.py (docs/designs/2026-11-09-beach-parasol-design.md).
export const PARASOL_SPEC = Object.freeze({
  /** Half the distance between two parallel sides of the octagonal canopy, in blocks. */
  canopyFlatHalfWidth: 2.5,
  /** From the ground to the top of the canopy, in blocks. */
  canopyTop: 4.5,
  /** From the base's centre to the canopy's centre, in blocks. */
  baseOffset: 3,
  /**
   * Cells the base and pole occupy, local to the base cell: `ahead` is toward the
   * canopy, `left` is to the left of that, `up` is above the base cell.
   */
  footCells: Object.freeze([
    Object.freeze({ ahead: 0, left: 0, up: 0 }),
    Object.freeze({ ahead: 0, left: 0, up: 1 }),
    Object.freeze({ ahead: 0, left: 0, up: 2 }),
    Object.freeze({ ahead: 0, left: 0, up: 3 }),
  ]),
  /** Smallest Chebyshev distance between two bases, in blocks. */
  minBaseDistance: 2,
  /** Hits in a row that fold the parasol back into its item, as for camp gear (ADR 0008). */
  hitsToTakeBack: 3,
  /** A gap longer than this, in ticks, starts the hit count again. */
  hitResetTicks: 100,
  defaultPaint: "white" satisfies Paint,
} as const);
