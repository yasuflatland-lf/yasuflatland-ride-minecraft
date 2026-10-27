import type { Paint } from "../shared/paint";

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
  clearance: 2,
  hitsToTakeBack: 3,
  hitResetTicks: 100,
  hostCheckTicks: 20,
});

export const FIRE_PIT_SPEC = Object.freeze({
  clearance: 2,
  hitsToTakeBack: 3,
  hitResetTicks: 100,
});

// Every tuning value of the tent.
export const TENT_SPEC = Object.freeze({
  /** Footprint across, walls included, in cells (local x -3..3). */
  width: 7,
  /** Footprint from the tarp's front edge to the rear wall, in cells (depth 0..11). */
  depth: 12,
  /** Free layers above the ground in both rooms; their ceiling cells are the next layer. */
  frontRoomHeadroom: 3,
  /** Free layers above the ground under the tarp; the tarp's ceiling cells are the next layer. */
  tarpHeadroom: 2,
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
