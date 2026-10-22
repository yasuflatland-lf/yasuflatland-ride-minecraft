import type { PlayerId } from "../shared/ids";
// Which rider sits where and who drives (ADR 0019, ADR 0025).
import { add, type Vec2 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import { DRIVER_SEAT, nearestSeat, type RiderPos, toLocal } from "./seats";

interface SeatingUpdate<R extends RiderPos> {
  /** Seats whose rider left since the last update, ascending. */
  readonly vacated: readonly number[];
  readonly driver: R | undefined;
  /** True when `driver` is defined and was not the driver before this update. */
  readonly mounted: boolean;
}

export class Seating {
  private seats: ReadonlyMap<PlayerId, number> = new Map();
  private driverId: PlayerId | undefined;

  constructor(private readonly positions: SeatLayout["positions"]) {}

  private seatsOf(riders: readonly RiderPos[], f: Vec2): Map<PlayerId, number> {
    const readings = riders.map((rider, order) => ({
      rider,
      order,
      local: toLocal(rider.offset, f),
      reading:
        rider.slot !== undefined && rider.slot < this.positions.length
          ? rider.slot
          : nearestSeat(toLocal(rider.offset, f), this.positions),
      previous: this.seats.get(rider.id),
    }));
    readings.sort(
      (a, b) =>
        Number(b.reading === b.previous) - Number(a.reading === a.previous) ||
        (a.rider.slot ?? Number.MAX_SAFE_INTEGER) -
          (b.rider.slot ?? Number.MAX_SAFE_INTEGER) ||
        a.order - b.order,
    );
    const seats = new Map<PlayerId, number>();
    const free = new Set(this.positions.map((_, seat) => seat));
    for (const { rider, local, reading, previous } of readings) {
      let seat: number | undefined;
      if (free.has(reading)) seat = reading;
      else if (previous !== undefined && free.has(previous)) seat = previous;
      else {
        let distance = Number.POSITIVE_INFINITY;
        for (const index of free) {
          const at = this.positions[index];
          if (!at) continue;
          const next = Math.hypot(local.x - at.x, local.z - at.z);
          if (next < distance) {
            seat = index;
            distance = next;
          }
        }
      }
      if (seat !== undefined) {
        seats.set(rider.id, seat);
        free.delete(seat);
      }
    }
    return seats;
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
    const vacated = [...this.seats]
      .filter(([id]) => !aboard.has(id))
      .map(([, seat]) => seat)
      .sort((a, b) => a - b);
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
    return { vacated, driver, mounted };
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
