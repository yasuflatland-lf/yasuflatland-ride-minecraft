import type { Paint } from "../shared/paint";
import type { Footprint } from "./tabletop";

// Every tuning value of the low chair (ADR 0122).
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

export const TABLE_SPEC = Object.freeze({
  clearance: 2,
  hitsToTakeBack: 3,
  hitResetTicks: 100,
});

export const DUTCH_OVEN_SPEC = Object.freeze({
  /** A vanilla sound played at the oven on each lid flip, so no sound file ships (ADR 0191). */
  lidSound: "open.iron_trapdoor",
  /** The item's yaw snaps to this many degrees. */
  yawStep: 90,
  clearance: 2,
  hitsToTakeBack: 3,
  hitResetTicks: 100,
  hostCheckTicks: 20,
});

export const FIRE_PIT_SPEC = Object.freeze({
  /** The item's yaw snaps to this many degrees. */
  yawStep: 90,
  clearance: 2,
  hitsToTakeBack: 3,
  hitResetTicks: 100,
});

// Bump when the laid cells or clear box change.
export const TENT_LAYOUT_VERSION = 3;

// Every tuning value of the tent.
export const TENT_SPEC = Object.freeze({
  /** Footprint across, walls included, in cells (local x -3..3). */
  width: 7,
  /** Footprint from the tarp's front edge to the rear wall, in cells (depth 0..8). */
  depth: 9,
  /** Maximum free layers in the body; stepped walls narrow the upper room layer. */
  frontRoomHeadroom: 3,
  /** Free layers above the ground under the tarp; the tarp's ceiling cells are the next layer. */
  tarpHeadroom: 2,
  /** Measured front ridge/base ratio 0.41: 2.9 of 7 blocks (ADR 0210). */
  leanWidth: 2.05,
  /** Measured side ratio about 0.49; retain standing rooms at 3.4 of 6 blocks (ADR 0210). */
  leanDepth: 1.3,
  /** Hits in a row from outside that take the tent down, as for the Low Chair (ADR 0122). */
  hitsToTakeDown: 3,
  /** A gap longer than this, in ticks, starts the hit count again. */
  hitResetTicks: 100,
  /** Pitched tents a world may hold, in all dimensions together. */
  maxTents: 4,
  /** The tent's yaw snaps to this many degrees. */
  yawStep: 90,
  /** light_emission of yasu_ride:tent_ceiling: 3 layers below it the block light is still 1, so no hostile mob spawns inside. Tuned in game. */
  ceilingLight: 4,
  /** light_emission of yasu_ride:tent_lantern while the lantern is on: the camper's fridge plate and ceiling light level. */
  lanternLight: 15,
  /** A loaded tent re-lays the cells the world lost once every this many lays, as the dock does (ADR 0096). */
  cellRecheckTicks: 20,
  /** Ticks a flap takes to roll up or drop, one step per tick; also each flap's tap window (ADR 0105). */
  flapSwingTicks: 10,
  /** The paint the variant-0 slot shows: the tan-brown fly, restored by brown dye (ADR 0076). */
  defaultPaint: "khaki" satisfies Paint,
});

export const FIRE_PIT_SPOTS = Object.freeze([
  Object.freeze({ x: 0, z: 0 }),
] as const);
// Must match GRILL_TOP in tools/gen_fire_pit.py (ADR 0168).
export const FIRE_PIT_TOP_PX = 12.5;

export const TABLE_SPOTS = Object.freeze([
  Object.freeze({ x: -7.5, z: 0 }),
  Object.freeze({ x: 7.5, z: 0 }),
] as const);
// Must match the tabletop origin plus thickness in tools/gen_camp_table.py (ADR 0168).
export const TABLE_TOP_PX = 12.25;
// Must match the 30 by 12 px tabletop cube in tools/gen_camp_table.py (ADR 0185).
export const TABLE_TOP_HALF_PX: Footprint = Object.freeze({
  halfX: 15,
  halfZ: 6,
});
/** Ovens and lanterns together, the owner's limit (ADR 0185). */
export const TABLE_TOP_LIMIT = 4;
// Per-axis half extents of the generated geometry, rounded up to 0.25 px: the
// oven reaches 5.61 px on x and 4.83 px on z, the lantern 3.70 and 3.08 px. An
// item on a table spawns at the table's yaw, so its model axes are the table's
// axes (ADR 0185).
export const DUTCH_OVEN_FOOTPRINT_PX: Footprint = Object.freeze({
  halfX: 5.75,
  halfZ: 5,
});
export const GAS_LANTERN_FOOTPRINT_PX: Footprint = Object.freeze({
  halfX: 3.75,
  halfZ: 3.25,
});

export const GAS_LANTERN_SPEC = Object.freeze({
  /** Matches the tent lantern's full-bright light (ADR 0173). */
  light: 15,
  /** Reaches the air above partial blocks while keeping full-block light in its own cell. */
  lightLift: 0.95,
  /** Follows falling lanterns and repairs lost light within one second. */
  lightTicks: 20,
  /** Re-reads the single light cell on every lay to repair lost or shared light promptly. */
  cellRecheckTicks: 1,
  /** One air cell fits the 11.3 px lantern (ADR 0173). */
  clearance: 1,
  /**
   * Counted from the table's own cell: the lantern stands on the 12.25 px top,
   * so its 11.3 px body and its light cell reach the cell above (ADR 0185).
   */
  tableClearance: 2,
  /** The item's yaw snaps to this many degrees. */
  yawStep: 90,
  /** Radius in blocks also finds lanterns settled onto partial blocks. */
  spacing: 0.75,
  hitsToTakeBack: 3,
  hitResetTicks: 100,
});

export const ROOF_TENT_SPEC = Object.freeze({
  /** SUV shell lift (5 px) plus sleeping-bag rise above its platform (2.4 px), from tools/gen_roof_tent.py. */
  seatLift: (5 + 2.4) / 16,
  /** A riding player's feet sit about 0.35 blocks below the seat point (Java ridingOffset convention).
   * The Bedrock value is unmeasured; the owner tunes it live. */
  seatRiderOffset: 0.35,
  /** Standing eye height assumption; tune with the rider offset after live checks. */
  standingEyeHeight: 1.62,
  /** SUV shell ridge from tools/gen_roof_tent.py, in blocks above the tent origin. */
  shellRidge: (5 + 1.2 * 12 + 6.6) / 16,
  /** Camera clearance below the ridge; tune live for first-person fit. */
  eyeBelowRidge: 0.2,
  /** Ground and camper shell ridge (19 px, GROUND_DIMS in tools/gen_roof_tent.py), in blocks above the tent origin. */
  groundShellRidge: 19 / 16,
  get occupantEyeHeight(): number {
    return this.shellRidge - this.eyeBelowRidge;
  },
  /** Short expiry bounds invisibility after a crash or lost tracking. */
  concealTicks: 30,
  /** Refresh before expiry while the tracked occupant is seated. */
  concealRefreshTicks: 10,
  // Variant 0 must resolve to the visible fly color for dye comparisons (ADR 0076).
  defaultPaint: TENT_SPEC.defaultPaint,
  /** Matches ground gear recovery so the same three deliberate hits fold it (ADR 0200). */
  hitsToFoldUp: 3,
  /** Matches the ground tent's five-second window for consecutive recovery hits. */
  hitResetTicks: 100,
  /** Checks faster than tabletop gear so a departing host promptly ejects its sleeper. */
  hostCheckTicks: 4,
  /** Preserves direct interaction reach for ground and roof tents. */
  interactReach: 3,
  /** Horizontal allowance around either end of the entrance ladder (ADR 0200). */
  entranceReach: 1.5,
  /** A narrow horizontal radius lets the ladder foot activate entry without taking over nearby driving. */
  footActivation: 0.7,
  /** Vertical allowance at ground or roof height for uneven footing (ADR 0200). */
  entranceBand: 1.5,
});
