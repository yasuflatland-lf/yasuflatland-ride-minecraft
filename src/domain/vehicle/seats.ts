import type { PlayerId } from "../shared/ids";
// Seat assignment and dismount detection (ADR 0019).
import {
  dot,
  forward,
  leftOf,
  localPoint,
  type Vec2,
  type Vec3,
} from "../shared/vec";
import type { HoldPose } from "./dock/floor";
import type { SeatLayout } from "./profile";

/** The farthest any seat in these layouts sits from its vehicle's location, in blocks on the ground plane. Deck seats stand at these spots at the vehicle's own height (seatWorldPositions), so this bounds their distance to the vehicle. */
export function farthestSeatReach(layouts: readonly SeatLayout[]): number {
  return Math.max(
    0,
    ...layouts.flatMap(({ positions }) =>
      positions.map(({ x, z }) => Math.hypot(x, z)),
    ),
  );
}

/** Converts a world-space offset into seat coordinates for a vehicle facing `f`. */
export function toLocal(offset: Vec2, f: Vec2): Vec2 {
  return { x: dot(offset, leftOf(f)), z: dot(offset, f) };
}

export function nearestSeat(
  local: Vec2,
  positions: SeatLayout["positions"],
): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [i, seat] of positions.entries()) {
    const dist = Math.hypot(local.x - seat.x, local.z - seat.z);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export interface RiderPos {
  id: PlayerId;
  offset: Vec2;
}

export function occupiedSeats(
  riders: readonly RiderPos[],
  f: Vec2,
  positions: SeatLayout["positions"],
): Map<PlayerId, number> {
  return new Map(
    riders.map((r) => [r.id, nearestSeat(toLocal(r.offset, f), positions)]),
  );
}

export function vacatedSeats(
  prev: ReadonlyMap<PlayerId, number>,
  now: ReadonlyMap<PlayerId, number>,
): number[] {
  return [...prev].filter(([id]) => !now.has(id)).map(([, seat]) => seat);
}

export function seatWorldPositions(
  pose: HoldPose,
  positions: SeatLayout["positions"],
): Vec3[] {
  const f = forward(pose.yaw);
  return positions.map((seat) => {
    // Seat x is positive to the left; localPoint takes right-positive offsets.
    const p = localPoint(pose, f, seat.z, -seat.x);
    return { x: p.x, y: pose.y, z: p.z };
  });
}
