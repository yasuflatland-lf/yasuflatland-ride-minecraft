// Seats a boarding player in the free seat they aim at, and keeps every rider in the
// seat they chose while others get in and out (ADR 0120).
import type { PlayerId } from "../shared/ids";
import type { Vec2, Vec3 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import { DRIVER_SEAT } from "./seats";

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
 * Where a boarding player aims from, in seat coordinates: x = left, y = up from the
 * vehicle's feet, z = forward. `view` is the line of sight; without one (a touch player,
 * whose press does not follow the view direction) the player aims at where they stand.
 */
export interface SeatAim {
  readonly eye: Vec3;
  readonly view?: Vec3;
}

/** The seats an aim is measured against: each is a ball of `radius` at `height` above the feet. */
export interface SeatTargets {
  readonly positions: SeatLayout["positions"];
  readonly height: number;
  readonly radius: number;
}

/**
 * How an aim reaches the seat at `seat`. A line of sight that passes within the radius
 * hits it, `along` blocks from the eye to where it enters the ball; `miss` is how far the
 * line of sight passes from the seat, never measured behind the eye. Without a line of
 * sight nothing hits, and `miss` is the distance from the eye on the ground plane.
 */
export function aimReach(
  aim: SeatAim,
  seat: Vec2,
  targets: SeatTargets,
): { readonly hit: boolean; readonly along: number; readonly miss: number } {
  const { eye, view } = aim;
  const length = view ? Math.hypot(view.x, view.y, view.z) : 0;
  if (!view || length === 0)
    return {
      hit: false,
      along: 0,
      miss: Math.hypot(seat.x - eye.x, seat.z - eye.z),
    };
  const u = { x: view.x / length, y: view.y / length, z: view.z / length };
  const d = { x: seat.x - eye.x, y: targets.height - eye.y, z: seat.z - eye.z };
  const t = Math.max(0, d.x * u.x + d.y * u.y + d.z * u.z);
  const miss = Math.hypot(d.x - u.x * t, d.y - u.y * t, d.z - u.z * t);
  const hit = miss <= targets.radius;
  const inside = hit ? Math.sqrt(targets.radius ** 2 - miss ** 2) : 0;
  return { hit, along: Math.max(0, t - inside), miss };
}

/**
 * The free seat the aim picks, undefined when none is free. A seat is free when nobody
 * sits in it and it is not `held` for another player. The first seat the line of sight
 * enters wins; when it enters none, the seat it passes nearest; a tie goes to the lower
 * index (ADR 0052).
 */
export function chooseSeat(
  aim: SeatAim,
  targets: SeatTargets,
  seats: SeatAssignment,
  held: SeatAssignment = [],
  requester?: PlayerId,
): number | undefined {
  let best: number | undefined;
  let bestReach: ReturnType<typeof aimReach> | undefined;
  for (const [seat, at] of targets.positions.entries()) {
    if (seats[seat] !== undefined) continue;
    if (held[seat] !== undefined && held[seat] !== requester) continue;
    const reach = aimReach(aim, at, targets);
    if (!bestReach || closer(reach, bestReach)) {
      best = seat;
      bestReach = reach;
    }
  }
  return best;
}

function closer(
  a: ReturnType<typeof aimReach>,
  b: ReturnType<typeof aimReach>,
): boolean {
  if (a.hit !== b.hit) return a.hit;
  return a.hit ? a.along < b.along : a.miss < b.miss;
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
 * - A requested player who is not aboard yet takes the free seat they aim at, in request
 *   order; a request of a player already aboard is ignored, and one that finds every
 *   seat taken is dropped. A seat `held` for a player, such as by a player on its deck
 *   seat (ADR 0063), is free only to that player.
 */
export function settleSeats(
  previous: SettledSeats,
  aboard: readonly AboardRider[],
  requests: ReadonlyMap<PlayerId, SeatAim>,
  targets: SeatTargets,
  held: SeatAssignment = [],
): SettledSeats {
  const { positions } = targets;
  const aboardIds = new Set(aboard.map((rider) => rider.id));
  const seats: (PlayerId | undefined)[] = positions.map((_, seat) => {
    const id = previous.seats[seat];
    return id !== undefined && aboardIds.has(id) ? id : undefined;
  });
  const driver = previous.seats[DRIVER_SEAT];
  const driverLeft =
    driver !== undefined &&
    !aboardIds.has(driver) &&
    !previous.boarding.has(driver);
  if (
    driverLeft &&
    seats[DRIVER_SEAT] === undefined &&
    seats[DRIVER_SEAT + 1] !== undefined
  ) {
    seats[DRIVER_SEAT] = seats[DRIVER_SEAT + 1];
    seats[DRIVER_SEAT + 1] = undefined;
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
    const seat = chooseSeat(aim, targets, seats, held, id);
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
  private readonly requests = new Map<PlayerId, SeatAim>();

  constructor(private readonly targets: SeatTargets) {}

  /** A player on foot asks for the free seat they aim at, seated on the next settle. */
  request(id: PlayerId, aim: SeatAim): void {
    this.requests.set(id, aim);
  }

  /**
   * Settles the seats with the riders aboard now and the requests since the last settle,
   * which it then forgets, and returns the rider list to keep. Requests skip the seats
   * `held` for other players.
   */
  settle(
    aboard: readonly AboardRider[],
    held: SeatAssignment = [],
  ): SeatAssignment {
    this.settled = settleSeats(
      this.settled,
      aboard,
      this.requests,
      this.targets,
      held,
    );
    this.requests.clear();
    return riderOrder(this.settled.seats);
  }
}
