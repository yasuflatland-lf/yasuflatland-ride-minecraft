import type { PlayerId } from "../shared/ids";
// Which rider sits where and who drives (ADR 0019, ADR 0025).
import { add, type Vec2 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import {
  nearestSeat,
  occupiedSeats,
  type RiderPos,
  toLocal,
  vacatedSeats,
} from "./seats";

/**
 * How a rider's seat is read: from their position (ADR 0019), or from their index in the
 * engine's rider list, which a kind whose players choose their seat keeps equal to the
 * seat (ADR 0120). The index does not lag the way a position can while the engine moves a
 * rider, so a rider laid into a rear seat never reads as the driver on the way.
 */
type SeatReading = "position" | "slot";

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

  constructor(
    private readonly positions: SeatLayout["positions"],
    private readonly reading: SeatReading = "position",
  ) {}

  private seatsOf(riders: readonly RiderPos[], f: Vec2): Map<PlayerId, number> {
    if (this.reading === "position")
      return occupiedSeats(riders, f, this.positions);
    return new Map(
      riders.map((r) => [
        r.id,
        r.slot ?? nearestSeat(toLocal(r.offset, f), this.positions),
      ]),
    );
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
    reading: SeatReading = "position",
  ): Seating {
    const seating = new Seating(positions, reading);
    seating.seats = seating.seatsOf(riders, f);
    seating.driverId = riders.find((r) => seating.seats.get(r.id) === 0)?.id;
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
    const seat = this.positions[0];
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
    return raw === 0 || advanced === 0 ? candidate : undefined;
  }

  /** `step` is the vehicle's world-space horizontal motion this tick, in blocks. */
  update<R extends RiderPos>(
    riders: readonly R[],
    f: Vec2,
    step: Vec2,
  ): SeatingUpdate<R> {
    const seats = this.seatsOf(riders, f);
    const vacated = vacatedSeats(this.seats, seats).sort((a, b) => a - b);
    this.seats = seats;
    // A driver stays the driver while aboard despite position lag (ADR 0025);
    // otherwise the rider closest to seat 0 takes over (ADR 0019, ADR 0126).
    // Slot readings never lag, so the driver is whoever sits in seat 0 (ADR 0120).
    const driver =
      this.reading === "position"
        ? (riders.find((r) => r.id === this.driverId) ??
          this.pickDriver(riders, f, step))
        : riders.find((r) => this.seats.get(r.id) === 0);
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
