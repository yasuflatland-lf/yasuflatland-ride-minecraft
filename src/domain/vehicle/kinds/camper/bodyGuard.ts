// Stops the camper's long body at walls the square collision box cannot see (ADR 0067).
import { localOffset, type Vec2, type Vec3 } from "../../../shared/vec";
import type { TickContext } from "../../drive";
import type { Form } from "../../motion/forms";
import type { MotionResult } from "../../motion/motion";

export interface BodyEnds {
  readonly front: number;
  readonly rear: number;
  readonly halfWidth: number;
  readonly height: number;
}

// In car form, layers 0 and 1 above the feet are steps the step probe climbs
// (ADR 0004); a solid cell from layer 2 up is a wall or an overhang the body
// cannot pass. Hover and submarine have no step probe, so every layer blocks.
const CAR_LOWEST_LAYER = 2;
// Keeps the outer lanes inside the body's width.
const SIDE_INSET = 0.1;
// Lanes at most one block apart hit every cell the end crosses, whatever the
// body's offset from the cell grid; wider gaps let a one-wide pillar between
// two lanes reach the nose (ADR 0067).
const MAX_LANE_SPACING = 1;
// Samples at most one block apart along the travel cannot straddle a one-thick
// wall: the body moves about 1.3 blocks per tick at top speed on default
// ground, so one sample at the end of the move could land past the wall
// (ADR 0067).
const MAX_TRAVEL_STEP = 1;

/** The lowest layer above the feet that blocks the body in `form`. */
export function lowestBlockingLayer(form: Form): number {
  return form === "car" ? CAR_LOWEST_LAYER : 0;
}

/**
 * Lateral offsets evenly spaced across the body, at most MAX_LANE_SPACING
 * apart, center-most first so the common head-on hit stops the scan early.
 */
export function endLanes(halfWidth: number): readonly number[] {
  const side = Math.max(0, halfWidth - SIDE_INSET);
  const count = Math.ceil((2 * side) / MAX_LANE_SPACING) + 1;
  if (count === 1) return [0];
  const spacing = (2 * side) / (count - 1);
  return Array.from({ length: count }, (_, i) => -side + i * spacing).sort(
    (a, b) => Math.abs(a) - Math.abs(b),
  );
}

/**
 * Distances along the travel at which to sample an end moving from `from` to
 * `to`: every MAX_TRAVEL_STEP beyond `from`, then `to` itself.
 */
function travelSamples(from: number, to: number): readonly number[] {
  const samples: number[] = [];
  for (let t = MAX_TRAVEL_STEP; from + t < to; t += MAX_TRAVEL_STEP)
    samples.push(from + t);
  samples.push(to);
  return samples;
}

/**
 * Whether a solid cell from `lowestLayer` up lies in the cells the end crosses
 * moving from `from` to `to` blocks along `dir`, across the body's width.
 * Nearer samples go first, so the scan stops at the first wall it meets.
 */
export function endBlocked(
  solidAt: (offset: Vec3) => boolean,
  dir: Vec2,
  from: number,
  to: number,
  ends: BodyEnds,
  lowestLayer: number,
): boolean {
  const lanes = endLanes(ends.halfWidth);
  for (const reach of travelSamples(from, to))
    for (let dy = lowestLayer; dy < Math.ceil(ends.height); dy++)
      for (const s of lanes) {
        const o = localOffset(dir, reach, s);
        if (solidAt({ x: o.x, y: dy, z: o.z })) return true; // stops at the first hit
      }
  return false;
}

/**
 * Stops the step when the end it moves toward would enter a wall within this
 * tick. The look-ahead is the velocity the engine applies this tick
 * (ctx.velocity + impulse), which is the post-friction speed divided by the
 * friction, so it covers the whole move; every cell the end crosses on the way
 * is sampled. The signed speed only picks the end.
 */
export function guardEnds(
  step: MotionResult,
  ctx: Pick<TickContext, "velocity" | "solidAt">,
  ends: BodyEnds,
  form: Form,
): MotionResult {
  const speed = step.state.speed;
  if (speed === 0) return step;
  const travel = Math.hypot(
    ctx.velocity.x + step.impulse.x,
    ctx.velocity.z + step.impulse.z,
  );
  const f = step.forward;
  const lowest = lowestBlockingLayer(form);
  const blocked =
    speed > 0
      ? endBlocked(
          ctx.solidAt,
          f,
          ends.front,
          ends.front + travel,
          ends,
          lowest,
        )
      : endBlocked(
          ctx.solidAt,
          { x: -f.x, z: -f.z },
          ends.rear,
          ends.rear + travel,
          ends,
          lowest,
        );
  if (!blocked) return step;
  // A step jump fired this tick would hop the stopped body in place.
  return {
    ...step,
    state: { ...step.state, speed: 0, stepTicks: 0 },
    impulse: { x: -ctx.velocity.x, z: -ctx.velocity.z },
    jumpVelocity: 0,
    blocked: true,
  };
}
