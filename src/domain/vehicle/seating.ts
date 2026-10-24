import type { PlayerId } from "../shared/ids";
// Which rider sits where and who drives (ADR 0019, ADR 0025, ADR 0128).
import { add, type Vec2 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import { DRIVER_SEAT, nearestSeat, type RiderPos, toLocal } from "./seats";

/** A rider who left their seat since the last update. */
export interface SeatLeaver {
  readonly id: PlayerId;
  readonly seat: number;
}

interface SeatingUpdate<R extends RiderPos> {
  /** Riders who left since the last update, with the seat each had, ascending by seat. */
  readonly left: readonly SeatLeaver[];
  /** Settled seats of riders who had no settled seat at the last update, ascending. */
  readonly boarded: readonly number[];
  readonly driver: R | undefined;
  /** True when `driver` is defined and was not the driver before this update. */
  readonly mounted: boolean;
}

/** The seats in `seats` whose rider `others` does not contain, ascending. */
function seatsOfRidersNotIn(
  seats: ReadonlyMap<PlayerId, number>,
  others: { has(id: PlayerId): boolean },
): number[] {
  return [...seats]
    .filter(([id]) => !others.has(id))
    .map(([, seat]) => seat)
    .sort((a, b) => a - b);
}

function ridersNotIn(
  seats: ReadonlyMap<PlayerId, number>,
  others: { has(id: PlayerId): boolean },
): SeatLeaver[] {
  return [...seats]
    .filter(([id]) => !others.has(id))
    .map(([id, seat]) => ({ id, seat }))
    .sort((a, b) => a.seat - b.seat);
}

export class Seating {
  private seats: ReadonlyMap<PlayerId, number> = new Map();
  private driverId: PlayerId | undefined;

  constructor(private readonly positions: SeatLayout["positions"]) {}

  /**
   * Gives every rider a unique seat (ADR 0128). Riders whose reading matches their previous
   * seat go first, then ascending slot, then list order; each takes their reading, else their
   * previous seat, else the free seat nearest them.
   */
  private seatsOf(riders: readonly RiderPos[], f: Vec2): Map<PlayerId, number> {
    const readings = riders.map((rider, order) => {
      const local = toLocal(rider.offset, f);
      const reading =
        rider.slot !== undefined && rider.slot < this.positions.length
          ? rider.slot
          : nearestSeat(local, this.positions);
      return {
        rider,
        order,
        local,
        reading,
        previous: this.seats.get(rider.id),
      };
    });
    readings.sort(
      (a, b) =>
        Number(b.reading === b.previous) - Number(a.reading === a.previous) ||
        (a.rider.slot ?? Number.MAX_SAFE_INTEGER) -
          (b.rider.slot ?? Number.MAX_SAFE_INTEGER) ||
        a.order - b.order,
    );
    const seats = new Map<PlayerId, number>();
    const free = new Set(this.positions.keys());
    for (const { rider, local, reading, previous } of readings) {
      let seat: number | undefined;
      if (free.has(reading)) seat = reading;
      else if (previous !== undefined && free.has(previous)) seat = previous;
      else seat = this.nearestFreeSeat(local, free);
      if (seat !== undefined) {
        seats.set(rider.id, seat);
        free.delete(seat);
      }
    }
    return seats;
  }

  /** Ties go to the lower seat index, since `free` iterates seats in ascending order. */
  private nearestFreeSeat(
    local: Vec2,
    free: ReadonlySet<number>,
  ): number | undefined {
    let nearest: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const seat of free) {
      const at = this.positions[seat];
      if (!at) continue;
      const distance = Math.hypot(local.x - at.x, local.z - at.z);
      if (distance < bestDistance) {
        nearest = seat;
        bestDistance = distance;
      }
    }
    return nearest;
  }

  /**
   * Seats riders who were already aboard when the aggregate was lost (e.g.
   * after `/reload`), so the first update does not report the current driver
   * as newly mounted. `f` is the forward vector of the entity's heading as
   * read, before the drive normalizes it.
   */
  static restore(
    positions: SeatLayout["positions"],
    riders: readonly RiderPos[],
    f: Vec2,
  ): Seating {
    const seating = new Seating(positions);
    seating.update(riders, f, { x: 0, z: 0 });
    return seating;
  }

  /**
   * The rider closest to seat 0, accepted only when their reading, or that
   * reading moved by `step`, falls in seat 0. A reading can lag the moving
   * vehicle by one tick of its world-space horizontal motion `step`, in blocks
   * (ADR 0126). Ties go to the earlier rider.
   */
  private pickDriver<R extends RiderPos>(
    riders: readonly R[],
    f: Vec2,
    step: Vec2,
  ): R | undefined {
    const seat = this.positions[DRIVER_SEAT];
    if (!seat) return undefined;
    let candidate: R | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const rider of riders) {
      const local = toLocal(rider.offset, f);
      const distance = Math.hypot(local.x - seat.x, local.z - seat.z);
      if (distance < bestDistance) {
        candidate = rider;
        bestDistance = distance;
      }
    }
    if (!candidate) return undefined;
    const raw = nearestSeat(toLocal(candidate.offset, f), this.positions);
    const advanced = nearestSeat(
      toLocal(add(candidate.offset, step), f),
      this.positions,
    );
    return raw === DRIVER_SEAT || advanced === DRIVER_SEAT
      ? candidate
      : undefined;
  }

  /** `step` is the vehicle's world-space horizontal motion this tick, in blocks. */
  update<R extends RiderPos>(
    riders: readonly R[],
    f: Vec2,
    step: Vec2,
  ): SeatingUpdate<R> {
    const seats = this.seatsOf(riders, f);
    const aboard = new Set(riders.map((r) => r.id));
    const left = ridersNotIn(this.seats, aboard);
    const boarded = seatsOfRidersNotIn(seats, this.seats);
    this.seats = seats;
    // Position-only riders retain the sticky driver and motion allowance (0025, 0126).
    const sticky = riders.find(
      (r) => r.id === this.driverId && r.slot === undefined,
    );
    const indexed = riders.find(
      (r) => r.slot !== undefined && seats.get(r.id) === DRIVER_SEAT,
    );
    const driver =
      sticky ??
      indexed ??
      this.pickDriver(
        riders.filter((r) => r.slot === undefined),
        f,
        step,
      );
    const mounted = driver !== undefined && this.driverId !== driver.id;
    this.driverId = driver?.id;
    return { left, boarded, driver, mounted };
  }

  /** The id of the current driver, if any. */
  get driver(): PlayerId | undefined {
    return this.driverId;
  }

  /** Whether anyone rides (any seat). */
  get occupied(): boolean {
    return this.seats.size > 0;
  }

  /** The seat indices riders sit in now. */
  taken(): ReadonlySet<number> {
    return new Set(this.seats.values());
  }
}
