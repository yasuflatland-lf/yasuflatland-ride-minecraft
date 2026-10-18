// Stops the camper's long body at walls the square collision box cannot see (ADR 0067).
import { rightOf, type Vec2, type Vec3 } from "../../../shared/vec";
import type { TickContext } from "../../drive";
import type { MotionResult } from "../../motion/motion";

export interface BodyEnds {
  readonly front: number;
  readonly rear: number;
  readonly halfWidth: number;
  readonly height: number;
}

// Layers 0 and 1 above the feet are steps the step probe climbs (ADR 0004);
// a solid cell from layer 2 up is a wall or an overhang the body cannot pass.
const LOWEST_BLOCKING_LAYER = 2;
// Keeps the side probes inside the body's width.
const SIDE_INSET = 0.1;

/** Whether a solid cell from layer 2 up lies `reach` blocks along `dir`, across the body's width. */
export function endBlocked(
  solidAt: (offset: Vec3) => boolean,
  dir: Vec2,
  reach: number,
  ends: BodyEnds,
): boolean {
  const r = rightOf(dir);
  const side = ends.halfWidth - SIDE_INSET;
  for (let dy = LOWEST_BLOCKING_LAYER; dy < Math.ceil(ends.height); dy++)
    for (const s of [0, -side, side]) // center first; stops at the first hit
      if (
        solidAt({
          x: dir.x * reach + r.x * s,
          y: dy,
          z: dir.z * reach + r.z * s,
        })
      )
        return true;
  return false;
}

/** Stops the step when the end it moves toward would enter a wall within this tick. */
export function guardEnds(
  step: MotionResult,
  ctx: Pick<TickContext, "velocity" | "solidAt">,
  ends: BodyEnds,
): MotionResult {
  const speed = step.state.speed;
  const f = step.forward;
  const blocked =
    (speed > 0 && endBlocked(ctx.solidAt, f, ends.front + speed, ends)) ||
    (speed < 0 &&
      endBlocked(ctx.solidAt, { x: -f.x, z: -f.z }, ends.rear - speed, ends));
  if (!blocked) return step;
  return {
    ...step,
    state: { ...step.state, speed: 0 },
    impulse: { x: -ctx.velocity.x, z: -ctx.velocity.z },
    blocked: true,
  };
}
