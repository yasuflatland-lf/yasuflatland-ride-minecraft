// Aggregate for one vehicle: its drive, driver, seats, ram cooldowns, and the hit count.
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import type { ClearCell, Departure, Dock } from "./dock";
import type { Drive, EngineCommand, RiderState, TickContext } from "./drive";
import type { RawInput } from "./driveInput";
import { type Cell, headlightCells as cellsLitFrom } from "./headlights";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import type { VehicleKind } from "./kind";
import type { ChaseCamera, VehicleProfile } from "./profile";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import { occupiedSeats, vacatedSeats } from "./seats";
import { SPEC } from "./spec";

export interface RiderView {
  id: string;
  offset: Vec2;
  yaw: number;
  raw: RawInput;
}

export interface VehicleTickInput extends TickContext {
  riders: readonly RiderView[];
  /** Input used only when there is no driver (for in-game tests). */
  testInput?: RawInput;
  /** Nearby targets. Called only when the speed exceeds the ram threshold (ADR 0083). */
  targets(): readonly RamTarget[];
}

/**
 * What one vehicle does this tick. The application's per-vehicle tick
 * applies it with these world calls, in this order, and a throw skips the
 * rest of that vehicle's tick (ADR 0055). Steps 3, 9, 10 and 11 run every
 * tick: with nothing to keep, they release what the vehicle held, seated,
 * laid or lit before.
 *
 * 1. `stepCommands`, in order, before anything else that could throw,
 *    because drives send them only on change (ADR 0055).
 * 2. `message` on the action bar of `driverId`, only when there is one.
 * 3. `dock.hold`; with no `dock`, the hold is released (ADR 0063, 0064).
 * 4. `clear`, when not empty, before the dock's cells are laid (ADR 0068).
 * 5. `riders` is collected. After every vehicle has ticked, the chase
 *    cameras are synced (ADR 0028, 0071), and water breathing is refreshed
 *    every `SPEC.waterBreathingInterval` ticks (ADR 0040).
 * 6. `impulse` and `yaw`, only when there is no `dock`: a docked vehicle is
 *    held instead of moved (ADR 0063).
 * 7. `boardDeckRiders`: the deck-seat riders move into the vehicle
 *    (ADR 0063), before standing players are seated (ADR 0068).
 * 8. `depart`: seat the standing players, nearest first, and move those
 *    left without a seat to the exit (ADR 0068).
 * 9. `dock.seats` at `yaw`, after boarding and departure; with no `dock`,
 *    the deck seats are removed.
 * 10. `dock.cells`; with no `dock`, the laid cells are cleared.
 * 11. Headlight cells along the vehicle's heading after this tick, or none
 *     when its headlights are off (ADR 0020).
 * 12. `hits`, credited to `driverId`.
 * 13. `finalCommands`, last: the vacated seats' commands, such as the door
 *     animation (ADR 0007, 0055).
 */
export interface TickOutcome {
  dock?: Dock;
  clear: readonly ClearCell[];
  message?: string;
  depart?: Departure;
  boardDeckRiders: boolean;
  impulse: Vec3;
  yaw: number;
  hits: RamHit[];
  driverId?: string;
  stepCommands: readonly EngineCommand[];
  finalCommands: readonly EngineCommand[];
  riders: RiderState;
}

export class Vehicle {
  private driverId: string | undefined;
  private seats = new Map<string, number>();
  private readonly lastHit = new Map<string, number>();
  private hitCounter: HitCounter = EMPTY_COUNTER;
  private lastSwitchUseTick = Number.NEGATIVE_INFINITY;
  /** Ticks since the last tick with a driver; infinite until the first driver (ADR 0078). */
  private driverlessTicks = Number.POSITIVE_INFINITY;

  /** Called only by kinds/index.ts, which picks the drive for the kind. */
  constructor(
    readonly id: string,
    private readonly profile: VehicleProfile,
    private readonly drive: Drive,
  ) {}

  /**
   * Seats riders who were already aboard when the aggregate was lost (e.g.
   * after `/reload`), so the first tick does not treat the current driver as
   * newly mounted, which would snap the heading to the driver's view. Called
   * only by kinds/index.ts. `yaw` is the entity's heading as read, before the
   * drive normalizes it.
   */
  seatRiders(riders: readonly RiderView[], yaw: number): void {
    this.seats = occupiedSeats(
      riders,
      forward(yaw),
      this.profile.seats.positions,
    );
    this.driverId = riders.find((r) => this.seats.get(r.id) === 0)?.id;
  }

  get kind(): VehicleKind {
    return this.profile.kind;
  }

  get speed(): number {
    return this.drive.speed;
  }

  get yaw(): number {
    return this.drive.yaw;
  }

  /** Cells the headlights light with the vehicle at `location`, along its current heading (ADR 0020). */
  headlightCells(location: Vec3): Cell[] {
    return cellsLitFrom(location, this.drive.yaw, this.profile.beams);
  }

  /** The camera this kind gives riders while the drive asks for third person: in flight and in submarine form (ADR 0028, 0040, 0071). */
  get chaseCamera(): ChaseCamera {
    return this.profile.chaseCamera;
  }

  /** A player tapped the door of this vehicle's room. Returns whether it opened or closed (ADR 0068). */
  useDockDoor(): boolean {
    return this.drive.useDockDoor?.() ?? false;
  }

  tick(input: VehicleTickInput): TickOutcome {
    const { riders, testInput, targets, ...sensors } = input;
    const seatCommands = this.updateSeats(riders);
    const driver = this.updateDriver(riders);
    this.driverlessTicks = driver ? 0 : this.driverlessTicks + 1;
    const awaitingDriver =
      driver === undefined &&
      riders.length > 0 &&
      this.driverlessTicks <= SPEC.driverHandoverTicks;

    const raw = driver?.raw ?? testInput;
    const taken = new Set(this.seats.values());
    const step = this.drive.step(raw, {
      ...sensors,
      awaitingDriver,
      deckSeatInputs: sensors.deckSeatInputs.map((deckInput, seat) =>
        taken.has(seat) ? undefined : deckInput,
      ),
    });

    return {
      dock: step.dock && {
        ...step.dock,
        seats: step.dock.seats.map((at, seat) =>
          taken.has(seat) ? undefined : at,
        ),
      },
      clear: step.clear ?? [],
      message: step.message,
      depart: step.depart,
      boardDeckRiders: step.boardDeckRiders ?? false,
      impulse: step.impulse,
      yaw: this.drive.yaw,
      hits: this.ram(sensors.tick, targets, step.forward),
      driverId: driver?.id,
      stepCommands: step.commands,
      finalCommands: seatCommands,
      riders: step.riders,
    };
  }

  private updateSeats(riders: readonly RiderView[]): readonly EngineCommand[] {
    const seats = occupiedSeats(
      riders,
      forward(this.drive.yaw),
      this.profile.seats.positions,
    );
    const commands = vacatedSeats(this.seats, seats)
      .sort((a, b) => a - b)
      .flatMap((seat) => this.drive.onSeatVacated(seat));
    this.seats = seats;
    return commands;
  }

  private updateDriver(riders: readonly RiderView[]): RiderView | undefined {
    // Driver = the rider in the driver's seat (seat 0) (ADR 0019). A driver
    // stays the driver while they ride: a rider's position can lag the moving
    // vehicle by a tick and read as another seat, which in flight would land
    // the vehicle (ADR 0025).
    const driver =
      riders.find((r) => r.id === this.driverId) ??
      riders.find((r) => this.seats.get(r.id) === 0);
    if (driver && this.driverId !== driver.id)
      this.drive.onDriverMounted(driver.yaw);
    this.driverId = driver?.id;
    return driver;
  }

  private ram(
    tick: number,
    targets: () => readonly RamTarget[],
    f: Vec2,
  ): RamHit[] {
    for (const [id, t] of this.lastHit)
      if (tick - t >= SPEC.ramCooldown) this.lastHit.delete(id);
    // selectHits checks the speed too; checking here skips the targets() query.
    if (Math.abs(this.drive.speed) <= SPEC.ramMinSpeed) return [];
    const hits = selectHits(
      f,
      this.drive.speed,
      targets(),
      this.lastHit,
      tick,
      this.profile.ram,
    );
    for (const h of hits) this.lastHit.set(h.id, tick);
    return hits;
  }

  /**
   * A player uses the headlight switch. Only the driver may flip it, and only
   * after the switch has been idle for the cooldown, so a burst of uses from
   * one touch flips it once (ADR 0024). Returns whether it flipped.
   */
  flipHeadlightSwitch(playerId: string, tick: number): boolean {
    if (playerId !== this.driverId) return false;
    const idle = tick - this.lastSwitchUseTick;
    this.lastSwitchUseTick = tick;
    return idle >= SPEC.headlightSwitchCooldown;
  }

  /** Hit by a player. Returns whether the vehicle breaks (ADR 0008). */
  receiveHit(tick: number): boolean {
    const r = registerHit(this.hitCounter, tick, this.seats.size > 0);
    this.hitCounter = r.counter;
    return r.broken;
  }
}
