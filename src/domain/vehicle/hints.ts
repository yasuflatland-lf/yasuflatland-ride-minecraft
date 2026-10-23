// Action-bar hints for players on foot near a vehicle (ADR 0086).
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import type { VehicleKind } from "./kind";
import { DRIVER_SEAT, toLocal } from "./seats";
import { SPEC } from "./spec";

/** The input a player last used; each gets its own wording for the interact gesture. */
export type HintControls = "touch" | "mouse" | "other";
export type HeldItem = "dye" | "other";

export const HINTS = Object.freeze({
  bumperTouch: "bumper_touch",
  bumperMouse: "bumper_mouse",
  bumperOther: "bumper_other",
  paint: "paint",
  driveTouch: "drive_touch",
  driveMouse: "drive_mouse",
  driveOther: "drive_other",
} as const);
export type HintName = (typeof HINTS)[keyof typeof HINTS];

/** One %s of a hint's text: a number, or the translated name of a vehicle kind. */
export type HintArg =
  | { readonly number: number }
  | { readonly vehicle: VehicleKind };

/** Shown as the lang key yasu_ride.hint.<name>, with `with` filling its %s in order. */
export interface Hint {
  readonly name: HintName;
  readonly with?: readonly HintArg[];
}

const BUMPER_HINT: Readonly<Record<HintControls, HintName>> = Object.freeze({
  touch: HINTS.bumperTouch,
  mouse: HINTS.bumperMouse,
  other: HINTS.bumperOther,
});
const DRIVE_HINT: Readonly<Record<HintControls, HintName>> = Object.freeze({
  touch: HINTS.driveTouch,
  mouse: HINTS.driveMouse,
  other: HINTS.driveOther,
});

/** Feet heights above the vehicle's location, lowest first. */
type FeetBand = readonly [number, number];

/**
 * Where a kind shows hints, in blocks in the vehicle's frame: x = left, z = forward,
 * y from the vehicle's location. A zone the kind leaves out shows nothing.
 */
export interface HintZones {
  /** The hitboxes in front of the body that take hits, paint, and the interact (ADR 0068, 0084). */
  readonly bumper?: {
    readonly boxXs: readonly number[];
    readonly boxZ: number;
    readonly boxHalf: number;
    /** The body's half width; a player inside the body, in the parked room, gets no bumper hint. */
    readonly bodyHalfWidth: number;
    /** How far from the boxes, on the ground plane, a player gets the hint. */
    readonly reach: number;
    readonly feet: FeetBand;
  };
  /** The driver's deck seat of a parked vehicle, at the profile's seat 0, for players nearer it than any other seat. */
  readonly driverSeat?: {
    readonly reach: number;
    readonly feet: FeetBand;
  };
}

export interface HintView {
  readonly kind: VehicleKind;
  /** The player's feet minus the vehicle's location. */
  readonly offset: Vec3;
  /** The vehicle's yaw. */
  readonly yaw: number;
  readonly docked: boolean;
  readonly driverSeatFree: boolean;
  /** Someone sits in a seat of the vehicle itself, so hits do not break it (ADR 0008). */
  readonly hasRiders: boolean;
  readonly held: HeldItem;
  readonly controls: HintControls;
}

const within = (y: number, [lo, hi]: FeetBand) => y >= lo && y <= hi;

/**
 * The hint for a player at `view.offset`, or none. The driver's seat wins where both
 * zones apply. `margin` widens every zone, its reach and the edge of the body it leaves
 * out, so within each zone the widened one holds the narrow one. Across zones it does
 * not: a widened driver's seat zone can overlap the bumper zone, so hold a shown hint
 * with `zoneOf` (ADR 0086).
 */
export function hintAt(
  zones: HintZones | undefined,
  seats: readonly Vec2[],
  view: HintView,
  margin = 0,
): Hint | undefined {
  if (!zones) return undefined;
  const local = toLocal(view.offset, forward(view.yaw));
  const seat = zones.driverSeat;
  const toDriverSeat =
    seats[DRIVER_SEAT] &&
    Math.hypot(local.x - seats[DRIVER_SEAT].x, local.z - seats[DRIVER_SEAT].z);
  if (
    seat &&
    toDriverSeat !== undefined &&
    view.docked &&
    view.driverSeatFree &&
    within(view.offset.y, seat.feet) &&
    toDriverSeat <= seat.reach + margin &&
    // Next to another seat a long-press takes that seat, which does not drive.
    seats.every(
      (s) => toDriverSeat <= Math.hypot(local.x - s.x, local.z - s.z) + margin,
    )
  )
    return { name: DRIVE_HINT[view.controls] };
  const bumper = zones.bumper;
  if (
    !bumper ||
    !within(view.offset.y, bumper.feet) ||
    (Math.abs(local.x) < bumper.bodyHalfWidth - margin &&
      local.z < bumper.boxZ - margin) ||
    distanceToBumper(local, bumper) > bumper.reach + margin
  )
    return undefined;
  const vehicle: HintArg = { vehicle: view.kind };
  if (view.held === "dye") return { name: HINTS.paint, with: [vehicle] };
  // With a rider aboard the hits do not break it, and the seats may all be taken.
  if (view.hasRiders) return undefined;
  return {
    name: BUMPER_HINT[view.controls],
    with: [{ number: SPEC.hitsToBreak }, vehicle],
  };
}

const DRIVE_HINTS: ReadonlySet<HintName> = new Set(Object.values(DRIVE_HINT));

/**
 * Only the zone that gives `name`. A shown hint keeps showing until the exit margin
 * past every edge of its own zone, so it is held by that zone alone and not lost to a
 * widened zone with a higher priority (ADR 0086).
 */
export function zoneOf(zones: HintZones, name: HintName): HintZones {
  return DRIVE_HINTS.has(name)
    ? { driverSeat: zones.driverSeat }
    : { bumper: zones.bumper };
}

function distanceToBumper(
  p: Vec2,
  b: NonNullable<HintZones["bumper"]>,
): number {
  const minX = Math.min(...b.boxXs) - b.boxHalf;
  const maxX = Math.max(...b.boxXs) + b.boxHalf;
  const dx = Math.max(minX - p.x, 0, p.x - maxX);
  const dz = Math.max(b.boxZ - b.boxHalf - p.z, 0, p.z - b.boxZ - b.boxHalf);
  return Math.hypot(dx, dz);
}

/** What one player was last shown, and when. */
export interface HintState {
  readonly shown?: HintName;
  /** The tick `shown` was first sent. */
  readonly since: number;
  readonly lastSent: number;
}

export const NO_HINT: HintState = Object.freeze({
  since: Number.NEGATIVE_INFINITY,
  lastSent: Number.NEGATIVE_INFINITY,
});

export interface HintTiming {
  /** Ticks between sends of the same hint. */
  readonly refresh: number;
  /** Ticks after the first send during which the hint is re-sent. */
  readonly showFor: number;
}

export const HINT_TIMING: HintTiming = Object.freeze({
  refresh: SPEC.hintRefreshTicks,
  showFor: SPEC.hintShowTicks,
});

export type HintAction = { readonly show: Hint } | "clear";

/**
 * Decides what to send a player this check. A new hint shows at once, the same one
 * is re-sent every `refresh` ticks until `showFor` has passed, and then stays quiet
 * until the player leaves or another hint applies. Leaving clears it once.
 */
export function stepHint(
  state: HintState,
  candidate: Hint | undefined,
  tick: number,
  timing: HintTiming = HINT_TIMING,
): { state: HintState; action?: HintAction } {
  if (!candidate)
    return state.shown === undefined
      ? { state }
      : { state: NO_HINT, action: "clear" };
  if (candidate.name !== state.shown)
    return {
      state: { shown: candidate.name, since: tick, lastSent: tick },
      action: { show: candidate },
    };
  if (
    tick - state.since < timing.showFor &&
    tick - state.lastSent >= timing.refresh
  )
    return { state: { ...state, lastSent: tick }, action: { show: candidate } };
  return { state };
}
