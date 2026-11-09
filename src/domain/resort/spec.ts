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

// Every tuning value of the beach chair. The numbers come from the model in
// tools/gen_beach_chair.py: the bed is one block wide and, at the photographed
// lounger's 2.86 to 1 length to width ratio, 46 px long, so the chair lies over
// three cells. The folded table is a low table the height of the chair bed,
// centred on the entity origin, so the tabletop host needs no centre offset.
// Only lanterns and ovens stand on it; it takes no blocks.
export const BEACH_CHAIR_SPEC = Object.freeze({
  /**
   * The bed outline local to the entity origin, in pixels (16 px per block).
   * -z is the foot end and +z the head end; it leaves 1 px of the three cells free at each end.
   */
  bedOutline: Object.freeze({ minX: -8, maxX: 8, minZ: -23, maxZ: 23 }),
  /** The lying player's seat (hips 4.5 px ahead of the backrest hinge), local to the entity origin, in blocks. */
  seatOffset: Object.freeze({ x: 0, y: 0.5625, z: 0.3125 }),
  // round(7 x 16/12) from the 12 px wide bed. The photos put the seat at 0.18
  // to 0.2 of the length, 8.3 to 9.2 px on 46 px, so 9 px also matches them.
  /** From the origin to the bed top and the folded table top, in pixels. */
  topPx: 9,
  /** Half the folded table top, in pixels: 16 px wide, as long as the 21 px main bed. */
  topHalf: Object.freeze({ halfX: 8, halfZ: 10.5 }),
  // Two ovens fit end to end (2 x 10 <= 21 px), or one oven and two lanterns,
  // or up to six lanterns in a 2 x 3 grid (2 x 7.5 <= 16, 3 x 6.5 <= 21 px).
  // The limit caps the lanterns at four, as on the Camp Table.
  /** Lanterns and ovens allowed on the table top. */
  topLimit: 4,
  /** Layers of air needed above the floor so a lying player fits. */
  headroom: 2,
  /** Hits in a row that take the chair back, as for camp gear (ADR 0008). */
  hitsToTakeBack: 3,
  /** A gap longer than this, in ticks, starts the hit count again. */
  hitResetTicks: 100,
  /** How often, in ticks, the leaning pose is sent again for late viewers. */
  poseRefreshTicks: 20,
  /** Dismount search starts beside the bed and stays near its ground level. */
  exitSideOffset: 1,
  exitSearchRadius: 4,
  exitSearchUp: 4,
  exitSearchDown: 8,
} as const);
