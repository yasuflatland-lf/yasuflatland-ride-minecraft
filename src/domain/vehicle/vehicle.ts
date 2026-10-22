import type { PlayerId, VehicleId } from "../shared/ids";
// Aggregate for one vehicle: wires its drive to its seating, cooldowns, and hit count.
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import { RamCooldowns, SwitchCooldown } from "./cooldowns";
import type { CabinetPress, DecorPlacement } from "./dock/decor";
import type { ClearCell, Departure, Dock } from "./dock/dock";
import type { Drive, EngineCommand, RiderState, TickContext } from "./drive";
import type { RawInput } from "./driveInput";
import {
  type HeldItem,
  type Hint,
  type HintControls,
  type HintName,
  hintAt,
  zoneOf,
} from "./hints";
import { EMPTY_COUNTER, type HitCounter, registerHit } from "./hitCounter";
import type { VehicleKind } from "./kind";
import {
  type Cell,
  headlightCells as cellsLitFrom,
} from "./lighting/headlights";
import type { ChaseCamera, VehicleProfile } from "./profile";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import { Seating } from "./seating";
import { SPEC } from "./spec";

export interface RiderView {
  readonly id: PlayerId;
  readonly offset: Vec2;
  readonly yaw: number;
  readonly raw: RawInput;
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
 * 8. `depart`: take any deck-seat rider the vehicle refused off their deck
 *    seat, then seat them and the standing players, nearest first, and move
 *    those left without a seat to the exit (ADR 0068, 0095).
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
  driverId?: PlayerId;
  stepCommands: readonly EngineCommand[];
  finalCommands: readonly EngineCommand[];
  riders: RiderState;
}

export class Vehicle {
  private seating: Seating;
  private readonly ramCooldowns = new RamCooldowns();
  private readonly switchCooldown = new SwitchCooldown();
  // Its own cooldown, so a driver's headlight switch and a ceiling light switch in the room never block each other (ADR 0115).
  private readonly ceilingLightCooldown = new SwitchCooldown();
  private hitCounter: HitCounter = EMPTY_COUNTER;
  /** Ticks since the last tick with a driver; infinite until the first driver (ADR 0078). */
  private driverlessTicks = Number.POSITIVE_INFINITY;
  /** As of the last tick: held in place (ADR 0063, 0068), and nobody in the driver's seat or its deck seat. */
  private docked = false;
  private driverSeatFree = true;

  /** Called only by kinds/index.ts, which picks the drive for the kind. */
  constructor(
    readonly id: VehicleId,
    private readonly profile: VehicleProfile,
    private readonly drive: Drive,
  ) {
    this.seating = new Seating(profile.seats.positions);
  }

  /**
   * Rebuilds a vehicle whose aggregate was lost (e.g. after `/reload`) with the
   * riders already aboard seated, so the first tick does not treat the current
   * driver as newly mounted, which would snap the heading to the driver's view.
   * Called only by kinds/index.ts. `yaw` is the entity's heading as read,
   * before the drive normalizes it.
   */
  static withRidersAboard(
    id: VehicleId,
    profile: VehicleProfile,
    drive: Drive,
    riders: readonly RiderView[],
    yaw: number,
  ): Vehicle {
    const vehicle = new Vehicle(id, profile, drive);
    vehicle.seating = Seating.restore(
      profile.seats.positions,
      riders,
      forward(yaw),
    );
    return vehicle;
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

  /** Whether this kind shows hints to players on foot (ADR 0086). */
  get showsHints(): boolean {
    return this.profile.hints !== undefined;
  }

  /**
   * The hint for a player on foot whose feet are `offset` from the vehicle's location.
   * A hint already shown to them (`current`) keeps showing up to SPEC.hintExitMargin
   * past the edges of its own zone, so standing on the edge does not flicker. A new
   * hint is picked with the zones at their narrow edges (ADR 0086, issue #355).
   */
  hint(
    offset: Vec3,
    held: HeldItem,
    controls: HintControls,
    current?: HintName,
  ): Hint | undefined {
    const view = {
      kind: this.kind,
      offset,
      yaw: this.drive.yaw,
      docked: this.docked,
      driverSeatFree: this.driverSeatFree,
      hasRiders: this.seating.occupied,
      held,
      controls,
    };
    const seats = this.profile.seats.positions;
    const zones = this.profile.hints;
    const hint = hintAt(zones, seats, view);
    if (hint || current === undefined || !zones) return hint;
    const kept = hintAt(
      zoneOf(zones, current),
      seats,
      view,
      SPEC.hintExitMargin,
    );
    return kept?.name === current ? kept : undefined;
  }

  /** A player tapped the door of this vehicle's room at `tick`. Returns whether it opened or closed (ADR 0068, 0105). */
  useDockDoor(tick: number): boolean {
    return this.drive.useDockDoor?.(tick) ?? false;
  }

  /** A player tapped the shower door at `tick`. Returns whether it opened or closed (ADR 0094, 0105). */
  useShowerDoor(tick: number): boolean {
    return this.drive.useShowerDoor?.(tick) ?? false;
  }

  /** A player asked for the shower. Returns whether it runs (ADR 0094). */
  runShower(): boolean {
    return this.drive.runShower?.() ?? false;
  }

  /** The decor of this vehicle's room, in slot order, then any stowed decor whose slot no longer exists (ADR 0093, 0103). */
  decor(): readonly DecorPlacement[] {
    return this.drive.decor?.() ?? [];
  }

  /** Puts `item` in `slot`, or empties it when undefined. Returns whether the decor changed (ADR 0093). */
  setDecor(slot: string, item: string | undefined): boolean {
    return this.drive.setDecor?.(slot, item) ?? false;
  }

  /** The free decor slot that accepts `item`: the slot of the pressed `cell` when it can take it, else the one nearest `point` unless `exact`, measured along the line of sight from `eye` when given; undefined for a kind without decor (ADR 0093, 0097, 0104, 0110). */
  decorSlotFor(
    item: string,
    point: Vec3,
    cell: Vec3,
    exact: boolean,
    eye?: Vec3,
  ): string | undefined {
    return this.drive.decorSlotFor?.(item, point, cell, exact, eye);
  }

  /** A player puts `item` in `slot`. Returns whether it was placed (ADR 0093). */
  placeDecor(slot: string, item: string): boolean {
    return this.drive.placeDecor?.(slot, item) ?? false;
  }

  /** A player takes the decor at world `cell` out, the one nearest the pressed `point` (seen from `eye`) when the cell holds two. Returns its item, if any (ADR 0093, 0108). */
  removeDecor(cell: Vec3, point?: Vec3, eye?: Vec3): string | undefined {
    return this.drive.removeDecor?.(cell, point, eye);
  }

  /** A player pressed the wall cabinet at world `cell` at `tick`. Returns what the press did, if anything (ADR 0114). */
  pressCabinet(
    cell: Vec3,
    point: Vec3 | undefined,
    tick: number,
  ): CabinetPress | undefined {
    return this.drive.pressCabinet?.(cell, point, tick);
  }

  tick(input: VehicleTickInput): TickOutcome {
    const { riders, testInput, targets, ...sensors } = input;
    const seated = this.seating.update(riders, forward(this.drive.yaw));
    const seatCommands = seated.vacated.flatMap((seat) =>
      this.drive.onSeatVacated(seat),
    );
    const driver = seated.driver;
    if (seated.mounted && driver) this.drive.onDriverMounted(driver.yaw);
    this.driverlessTicks = driver ? 0 : this.driverlessTicks + 1;
    const awaitingDriver =
      driver === undefined &&
      riders.length > 0 &&
      this.driverlessTicks <= SPEC.driverHandoverTicks;

    const raw = driver?.raw ?? testInput;
    const taken = this.seating.taken();
    const deckSeatInputs = sensors.deckSeatInputs.map((deckInput, seat) =>
      taken.has(seat) ? undefined : deckInput,
    );
    const step = this.drive.step(raw, {
      ...sensors,
      awaitingDriver,
      deckSeatInputs,
    });
    this.docked = step.dock !== undefined;
    // A deck seat's input is defined only while a player sits in it.
    this.driverSeatFree = !taken.has(0) && deckSeatInputs[0] === undefined;

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

  private ram(
    tick: number,
    targets: () => readonly RamTarget[],
    f: Vec2,
  ): RamHit[] {
    this.ramCooldowns.prune(tick);
    // selectHits checks the speed too; checking here skips the targets() query.
    if (Math.abs(this.drive.speed) <= SPEC.ramMinSpeed) return [];
    const hits = selectHits(
      f,
      this.drive.speed,
      targets(),
      this.ramCooldowns.recent,
      tick,
      this.profile.ram,
    );
    this.ramCooldowns.record(hits, tick);
    return hits;
  }

  /**
   * A player uses the headlight switch. Only the driver may flip it, and only
   * after the switch has been idle for the cooldown, so a burst of uses from
   * one touch flips it once (ADR 0024). Returns whether it flipped.
   */
  flipHeadlightSwitch(playerId: PlayerId, tick: number): boolean {
    if (playerId !== this.seating.driver) return false;
    return this.switchCooldown.tryUse(tick, SPEC.headlightSwitchCooldown);
  }

  /**
   * A player who is not at the wheel uses the light switch with their feet at `feet`: inside a
   * parked room, it turns the ceiling lights on or off. The driver's switch stays the
   * headlights' (ADR 0020). It uses its own cooldown with the headlight switch's duration, so
   * one touch flips once (ADR 0024, 0115). Returns whether it flipped.
   */
  switchCeilingLights(playerId: PlayerId, feet: Vec3, tick: number): boolean {
    if (playerId === this.seating.driver || !this.drive.switchCeilingLights)
      return false;
    if (!this.ceilingLightCooldown.tryUse(tick, SPEC.headlightSwitchCooldown))
      return false;
    return this.drive.switchCeilingLights(feet);
  }

  /**
   * Whether a use of the light switch by `playerId` with feet at `feet` is one for the ceiling
   * lights: not the driver's, and from inside a room that has them. It ignores the cooldown
   * and changes nothing, so a press is taken over only where the switch can work (ADR 0115).
   */
  canSwitchCeilingLights(playerId: PlayerId, feet: Vec3): boolean {
    if (playerId === this.seating.driver) return false;
    return this.drive.ceilingLightsReachable?.(feet) ?? false;
  }

  /** Hit by a player. Returns whether the vehicle breaks (ADR 0008). */
  receiveHit(tick: number): boolean {
    const r = registerHit(this.hitCounter, tick, this.seating.occupied);
    this.hitCounter = r.counter;
    return r.broken;
  }
}
