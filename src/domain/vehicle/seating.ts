import type { PlayerId } from "../shared/ids";
// Which rider sits where and who drives (ADR 0128, ADR 0223).
import { distanceXZ, type Vec2 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import { DRIVER_SEAT, nearestSeat, toLocal } from "./seats";

export interface RiderPos {
  id: PlayerId;
  offset: Vec2;
  /** The rider's index in the engine's rider list (ADR 0223). */
  slot: number;
}

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

/** The riders in `seats` that `others` does not contain, ascending by seat. */
function ridersNotIn(
  seats: ReadonlyMap<PlayerId, number>,
  others: { has(id: PlayerId): boolean },
): SeatLeaver[] {
  return [...seats]
    .filter(([id]) => !others.has(id))
    .map(([id, seat]) => ({ id, seat }))
    .sort((a, b) => a.seat - b.seat);
}

/** The seats in `seats` whose rider `others` does not contain, ascending. */
function seatsOfRidersNotIn(
  seats: ReadonlyMap<PlayerId, number>,
  others: { has(id: PlayerId): boolean },
): number[] {
  return ridersNotIn(seats, others).map(({ seat }) => seat);
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
        rider.slot < this.positions.length
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
        a.rider.slot - b.rider.slot ||
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
      const distance = distanceXZ(local, at);
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
    seating.update(riders, f);
    return seating;
  }

  update<R extends RiderPos>(riders: readonly R[], f: Vec2): SeatingUpdate<R> {
    const seats = this.seatsOf(riders, f);
    const aboard = new Set(riders.map((r) => r.id));
    const left = ridersNotIn(this.seats, aboard);
    const boarded = seatsOfRidersNotIn(seats, this.seats);
    this.seats = seats;
    const driver = riders.find((r) => seats.get(r.id) === DRIVER_SEAT);
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
