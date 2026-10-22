// A stand-in entity that takes a vehicle's hits and interactions at one spot of its body
// (ADR 0116). A minecraft:custom_hit_test pivot stays in world axes whatever the entity's
// yaw, and a hit test changed after spawn never reaches the client (ADR 0068), so a kind's
// stand-in comes as two entity types with fixed boxes: one with its row of boxes along
// world x and one along world z. The vehicle keeps the type whose row lies across its
// heading at the spot `ahead` of its location.
import { forward, type Vec3 } from "../shared/vec";

/** The world axis a stand-in's row of boxes lies along. */
export type StandInAxis = "x" | "z";

export interface StandInRule {
  /** Names the kind's stand-in entity types, `<name>_x` and `<name>_z`. */
  readonly name: string;
  /** Blocks from the vehicle's location, along its heading, to the middle of the row. */
  readonly ahead: number;
  /**
   * Degrees past the 45-degree line before a turning vehicle swaps the stand-in for the
   * other type, so steering along a diagonal does not respawn it every tick.
   */
  readonly turnMargin: number;
  /**
   * The most whole blocks the stand-in rises over solid ground under its middle box, so
   * a vehicle stopped with its end over a rise keeps its boxes above the ground; none
   * when absent (ADR 0119).
   */
  readonly maxLift?: number;
}

/** Where a vehicle's stand-in stands this tick: the feet of the middle box. */
export interface StandInPose extends Vec3 {
  readonly name: string;
  readonly axis: StandInAxis;
}

const QUARTER_TURN = 90;
const FULL_TURN = 360;
// A yaw a whole number of quarters turned gives sines like 6e-17; rounding them away puts
// a parked vehicle's stand-in exactly on its cell row.
const EXACT = 1e9;

/** The angle in degrees, from 0 to 180, between two yaws. */
export function yawGap(a: number, b: number): number {
  const d = (((a - b) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return Math.min(d, FULL_TURN - d);
}

/** The row axis across the heading nearest `yaw`: x when it faces along z, else z. */
export function nearestAxis(yaw: number): StandInAxis {
  return Math.abs(Math.round(yaw / QUARTER_TURN)) % 2 === 0 ? "x" : "z";
}

/** The angle in degrees from `yaw` to the nearest heading whose row lies along `axis`. */
function gapToAxis(yaw: number, axis: StandInAxis): number {
  const facing = axis === "x" ? 0 : QUARTER_TURN;
  return Math.min(yawGap(yaw, facing), yawGap(yaw, facing + FULL_TURN / 2));
}

/**
 * The row axis a vehicle at `yaw` should have when its stand-in has `current`: `current`
 * until the yaw is more than `margin` degrees past the 45-degree line, else the nearest.
 * A yaw a whole number of quarters turned, as a parked camper's (ADR 0068), always gets
 * its own axis.
 */
export function standInAxis(
  yaw: number,
  current: StandInAxis | undefined,
  margin: number,
): StandInAxis {
  const nearest = nearestAxis(yaw);
  if (current === undefined || current === nearest) return nearest;
  return gapToAxis(yaw, current) <= QUARTER_TURN / 2 + margin
    ? current
    : nearest;
}

const exact = (v: number) => Math.round(v * EXACT) / EXACT + 0;

/** The stand-in's pose for a vehicle at `location` facing `yaw`, with its row along `axis`. */
export function standInPose(
  rule: StandInRule,
  location: Vec3,
  yaw: number,
  axis: StandInAxis,
): StandInPose {
  const f = forward(yaw);
  return {
    name: rule.name,
    axis,
    x: location.x + exact(f.x) * rule.ahead,
    y: location.y,
    z: location.z + exact(f.z) * rule.ahead,
  };
}

/**
 * The stand-in raised by the number of solid layers, up to `maxLift`, counted from its feet
 * up in the cell of its middle box: `solidLayer(k)` tells whether layer k is solid. A plant
 * has no collision, so it lifts nothing (ADR 0119).
 */
export function liftStandIn(
  pose: StandInPose,
  maxLift: number,
  solidLayer: (layer: number) => boolean,
): StandInPose {
  let lift = 0;
  while (lift < maxLift && solidLayer(lift)) lift++;
  return lift === 0 ? pose : { ...pose, y: pose.y + lift };
}
