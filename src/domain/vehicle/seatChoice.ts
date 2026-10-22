// Seats a boarding player in the free seat they aim at, and keeps every rider in the
// seat they chose while others get in and out (ADR 0120).
import type { PlayerId } from "../shared/ids";
import type { Vec2, Vec3 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import { nearestSeat } from "./seats";

/**
 * Who sits in each seat, by seat index; undefined is a free seat. The engine seats riders
 * by their place in its rider list (ADR 0019), so a free seat below a taken one is held by
 * an invisible seat filler.
 */
export type SeatAssignment = readonly (PlayerId | undefined)[];

/** A player riding the vehicle, with their index in the engine's rider list when known. */
export interface AboardRider {
  readonly id: PlayerId;
  readonly slot?: number;
}

/**
 * Where a player aims, as an offset from the vehicle's feet on the ground plane (world
 * axes). `eye` is the eye's offset from the vehicle's feet and `view` the view direction.
 * A sight line that comes down to `height` above the feet aims where it crosses that
 * height; any other aims at the point of its horizontal line nearest the vehicle's center,
 * which is the eye itself for a player looking straight up or down or away.
 */
export function aimPoint(eye: Vec3, view: Vec3, height: number): Vec2 {
  if (view.y < 0 && eye.y > height) {
    const t = (height - eye.y) / view.y;
    return { x: eye.x + view.x * t, z: eye.z + view.z * t };
  }
  const flat = view.x * view.x + view.z * view.z;
  const along = flat > 0 ? -(eye.x * view.x + eye.z * view.z) / flat : 0;
  const t = Math.max(0, along);
  return { x: eye.x + view.x * t, z: eye.z + view.z * t };
}

/**
 * The free seat nearest `aim` (seat coordinates: x = left, z = forward), the lower index on
 * a tie (ADR 0052); undefined when every seat is taken.
 */
export function chooseSeat(
  aim: Vec2,
  positions: SeatLayout["positions"],
  seats: SeatAssignment,
): number | undefined {
  const free = positions
    .map((at, seat) => ({ at, seat }))
    .filter(({ seat }) => seats[seat] === undefined);
  if (free.length === 0) return undefined;
  const pick = nearestSeat(
    aim,
    free.map(({ at }) => at),
  );
  return free[pick]?.seat;
}

/** The seats after a settle, and the players seated by a request who are not aboard yet. */
export interface SettledSeats {
  readonly seats: SeatAssignment;
  readonly boarding: ReadonlySet<PlayerId>;
}

/**
 * The seats after this tick's boarding and leaving. `previous` comes from the last settle,
 * whose `boarding` players were only about to get in:
 * - A rider who stays keeps their seat. When the driver left, the rider of seat 1 moves
 *   into seat 0, as the engine would move them (ADR 0019); a rider behind stays. A player
 *   who was about to get in and did not is not a driver who left.
 * - A rider the engine seated without a request takes their rider-list slot when it is a
 *   free seat, else the lowest free seat, in slot order.
 * - A requested player who is not aboard yet takes the free seat nearest their aim, in
 *   request order; a request of a player already aboard is ignored, and one that finds
 *   every seat taken is dropped.
 */
export function settleSeats(
  previous: SettledSeats,
  aboard: readonly AboardRider[],
  requests: ReadonlyMap<PlayerId, Vec2>,
  positions: SeatLayout["positions"],
): SettledSeats {
  const aboardIds = new Set(aboard.map((rider) => rider.id));
  const seats: (PlayerId | undefined)[] = positions.map((_, seat) => {
    const id = previous.seats[seat];
    return id !== undefined && aboardIds.has(id) ? id : undefined;
  });
  const driver = previous.seats[0];
  const driverLeft =
    driver !== undefined &&
    !aboardIds.has(driver) &&
    !previous.boarding.has(driver);
  if (driverLeft && seats[0] === undefined && seats[1] !== undefined) {
    seats[0] = seats[1];
    seats[1] = undefined;
  }
  const seated = new Set(seats.filter((id) => id !== undefined));
  const unseated = aboard
    .filter((rider) => !seated.has(rider.id))
    .sort(
      (a, b) =>
        (a.slot ?? Number.POSITIVE_INFINITY) -
        (b.slot ?? Number.POSITIVE_INFINITY),
    );
  for (const rider of unseated) {
    const slot = rider.slot;
    const seat =
      slot !== undefined && slot < seats.length && seats[slot] === undefined
        ? slot
        : seats.indexOf(undefined);
    if (seat >= 0) seats[seat] = rider.id;
  }
  const boarding = new Set<PlayerId>();
  for (const [id, aim] of requests) {
    if (aboardIds.has(id)) continue;
    const seat = chooseSeat(aim, positions, seats);
    if (seat === undefined) continue;
    seats[seat] = id;
    boarding.add(id);
  }
  return { seats, boarding };
}

/**
 * The engine's rider list that puts everyone in their seat: the player of each seat up to
 * the last taken one, with undefined for a seat filler in each free seat below it.
 */
export function riderOrder(seats: SeatAssignment): SeatAssignment {
  let last = seats.length - 1;
  while (last >= 0 && seats[last] === undefined) last--;
  return seats.slice(0, last + 1);
}

/** The chosen seats of one vehicle (ADR 0120). */
export class ChosenSeats {
  private settled: SettledSeats = { seats: [], boarding: new Set() };
  private readonly requests = new Map<PlayerId, Vec2>();

  constructor(private readonly positions: SeatLayout["positions"]) {}

  /** A player on foot asks for the free seat nearest `aim` (seat coordinates), seated on the next settle. */
  request(id: PlayerId, aim: Vec2): void {
    this.requests.set(id, aim);
  }

  /**
   * Settles the seats with the riders aboard now and the requests since the last settle,
   * which it then forgets, and returns the rider list to keep.
   */
  settle(aboard: readonly AboardRider[]): SeatAssignment {
    this.settled = settleSeats(
      this.settled,
      aboard,
      this.requests,
      this.positions,
    );
    this.requests.clear();
    return riderOrder(this.settled.seats);
  }
}
