import type { Paint } from "../shared/paint";

// Every tuning value of the beach parasol. The dimensions come from the model in
// tools/gen_beach_parasol.py: BASE_OFFSET, CANOPY_TOP, BASE_CELLS and POLE_FOOT_CELLS.
export const PARASOL_SPEC = Object.freeze({
  /** Half the distance between two parallel sides of the octagonal canopy, in blocks. */
  canopyFlatHalfWidth: 2.5,
  /** From the ground to the top of the canopy, in blocks. */
  canopyTop: 4.1875,
  /** From the base's centre to the canopy's centre, in blocks. */
  baseOffset: 3.25,
  /**
   * Cells the base and pole occupy, local to the base cell: `ahead` is toward the
   * canopy (model -z), `left` is model +x, and `up` is model +y.
   * BASE_CELLS followed by POLE_FOOT_CELLS, with duplicate cells removed.
   */
  footCells: Object.freeze([
    Object.freeze({ ahead: 0, left: -1, up: 0 }),
    Object.freeze({ ahead: -1, left: -1, up: 0 }),
    Object.freeze({ ahead: 1, left: 0, up: 0 }),
    Object.freeze({ ahead: 0, left: 0, up: 0 }),
    Object.freeze({ ahead: -1, left: 0, up: 0 }),
    Object.freeze({ ahead: 1, left: 1, up: 0 }),
    Object.freeze({ ahead: 0, left: 1, up: 0 }),
    Object.freeze({ ahead: -1, left: 1, up: 0 }),
    Object.freeze({ ahead: 0, left: 0, up: 1 }),
    Object.freeze({ ahead: 0, left: 0, up: 2 }),
    Object.freeze({ ahead: -1, left: 0, up: 2 }),
    Object.freeze({ ahead: 0, left: 0, up: 3 }),
    Object.freeze({ ahead: -1, left: 0, up: 3 }),
    Object.freeze({ ahead: 0, left: 0, up: 4 }),
  ]),
  /** Smallest Chebyshev distance between two bases, in blocks. */
  minBaseDistance: 2,
  /** Hits in a row that fold the parasol back into its item, as for camp gear (ADR 0008). */
  hitsToTakeBack: 3,
  /** A gap longer than this, in ticks, starts the hit count again. */
  hitResetTicks: 100,
  /** How often, in ticks, loaded parasols lay their rain ceiling again. */
  ceilingSyncTicks: 20,
  defaultPaint: "white" satisfies Paint,
} as const);

// Every tuning value of the beach chair. seatOffset, topPx, topHalf and
// bedOutlinePx are measured from the model in tools/gen_beach_chair.py.
export const BEACH_CHAIR_SPEC = Object.freeze({
  /** The lying player's seat, local to the entity origin, in blocks. */
  seatOffset: Object.freeze({ x: 0, y: 0.4375, z: 0.125 }),
  /** Table height from TABLE_TOP_PX in tools/gen_beach_chair.py; the chair bed stays at 7 px. */
  topPx: 16,
  /** Half the table top's size, in pixels. */
  topHalf: Object.freeze({ halfX: 6, halfZ: 16 }),
  /** The bed's outline around the origin, in pixels. */
  bedOutlinePx: Object.freeze({ minX: -6, maxX: 6, minZ: -16, maxZ: 16 }),
  /** Lanterns and ovens that fit on the table top. */
  topLimit: 4,
  /** Layers of air needed above the floor so a lying player fits. */
  headroom: 2,
  /** Hits in a row that take the chair back, as for camp gear (ADR 0008). */
  hitsToTakeBack: 3,
  /** A gap longer than this, in ticks, starts the hit count again. */
  hitResetTicks: 100,
  /** How often, in ticks, the leaning pose is sent again for late viewers. */
  poseRefreshTicks: 20,
  /** How often loaded chairs repair or clear their tabletop blocks, in ticks. */
  topSyncTicks: 20,
} as const);
