import type { PlayerId } from "../shared/ids";
// Which rider sits where and who drives (ADR 0019, ADR 0025).
import type { Vec2 } from "../shared/vec";
import type { SeatLayout } from "./profile";
import { occupiedSeats, type RiderPos, vacatedSeats } from "./seats";

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
    seating.seats = occupiedSeats(riders, f, positions);
    seating.driverId = riders.find((r) => seating.seats.get(r.id) === 0)?.id;
    return seating;
  }

  update<R extends RiderPos>(riders: readonly R[], f: Vec2): SeatingUpdate<R> {
    const seats = occupiedSeats(riders, f, this.positions);
    const vacated = vacatedSeats(this.seats, seats).sort((a, b) => a - b);
    this.seats = seats;
    // Driver = the rider in the driver's seat (seat 0) (ADR 0019). A driver
    // stays the driver while they ride: a rider's position can lag the moving
    // vehicle by a tick and read as another seat, which in flight would land
    // the vehicle (ADR 0025).
    const driver =
      riders.find((r) => r.id === this.driverId) ??
      riders.find((r) => this.seats.get(r.id) === 0);
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
