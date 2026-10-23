import {
  EMPTY_COUNTER,
  type HitCounter,
  registerHit,
} from "../shared/hitCounter";
import type { PlayerId, VehicleId } from "../shared/ids";
import { SwitchCooldown } from "../shared/switchCooldown";
// Aggregate for one vehicle: wires its drive to its seating, cooldowns, and hit count.
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import { RamCooldowns } from "./cooldowns";
import { Crew } from "./crew";
import type { CutColumn } from "./cut";
import type { DecorPlacement, StoragePress } from "./dock/decor";
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
import type { VehicleKind } from "./kind";
import {
  headlightCells as cellsLitFrom,
  type LitCell,
} from "./lighting/headlights";
import type { ChaseCamera, VehicleProfile } from "./profile";
import { type RamHit, type RamTarget, selectHits } from "./ram";
import type { SeatAssignment } from "./seatChoice";
import { DRIVER_SEAT, toLocal } from "./seats";
import { SPEC } from "./spec";
import {
  liftStandIn,
  type StandInAxis,
  type StandInPose,
  standInAxis,
  standInPose,
} from "./standIn";

const HALF_BLOCK = 0.5;

export interface RiderView {
  readonly id: PlayerId;
  readonly offset: Vec2;
  readonly yaw: number;
  readonly raw: RawInput;
  /** The rider's index in the engine's rider list, which is the seat it puts them in (ADR 0019). */
  readonly slot?: number;
}

export interface VehicleTickInput extends TickContext {
  riders: readonly RiderView[];
  /** Input used only when there is no driver (for in-game tests). */
  testInput?: RawInput;
  /** The player on each deck seat, in deck seat order (ADR 0063, 0120). */
  deckSeatRiders?: readonly (PlayerId | undefined)[];
  /** Nearby targets. Called only when the speed exceeds the ram threshold (ADR 0083). */
  targets(): readonly RamTarget[];
}

/**
 * What one vehicle does this tick. The application's per-vehicle tick
 * applies it with these world calls, in this order, and a throw skips the
 * rest of that vehicle's tick (ADR 0055). Steps 3, 11, 12, 13 and 14 run
 * every tick: with nothing to keep, they release what the vehicle held,
 * seated, stood in for it, laid or lit before.
 *
 * 1. `stepCommands`, in order, before anything else that could throw,
 *    because drives send them only on change (ADR 0055); if they fail, the vehicle
 *    resyncs and sends every value again next tick (ADR 0127).
 * 2. `message` on the action bar of `driverId`, only when there is one.
 * 3. `dock.hold`; with no `dock`, the hold is released (ADR 0063, 0064).
 * 4. `clear`, when not empty, before the dock's cells are laid (ADR 0068).
 * 5. `cut`, when not empty, right after `clear` and before the move, so the
 *    body moves into the cleared strip on the same tick (ADR 0137).
 * 6. `riders` is collected. After every vehicle has ticked, the chase
 *    cameras are synced (ADR 0028, 0071), and water breathing is refreshed
 *    every `SPEC.waterBreathingInterval` ticks (ADR 0040).
 * 7. `impulse` and `yaw`, only when there is no `dock`: a docked vehicle is
 *    held instead of moved (ADR 0063).
 * 8. `seatLayout`: for a kind whose players choose their seat, the
 *    vehicle's riders are laid in this order, with a seat filler for each
 *    undefined entry, so each player sits in their seat (ADR 0120).
 * 9. `boardDeckRiders`: the deck-seat riders move into the vehicle
 *    (ADR 0063), before standing players are seated (ADR 0068).
 * 10. `depart`: take any deck-seat rider the vehicle refused off their deck
 *    seat, then seat them and the standing players, nearest first, and move
 *    those left without a seat to the exit (ADR 0068, 0095).
 * 11. `dock.seats` at `yaw`, after boarding and departure; with no `dock`,
 *    the deck seats are removed.
 * 12. `standIn`: the vehicle's one stand-in entity is kept at this pose, or
 *     removed when there is none (ADR 0116).
 * 13. `dock.cells`; with no `dock`, the laid cells are cleared.
 * 14. Headlight cells along the vehicle's heading after this tick, or none
 *     when its headlights are off (ADR 0020).
 * 15. `hits`, credited to `driverId`.
 * 16. `finalCommands`, last: the vacated seats' commands, such as the door
 *     animation, then the taken seats' commands (ADR 0007, 0055).
 */
export interface TickOutcome {
  dock?: Dock;
  clear: readonly ClearCell[];
  cut: readonly CutColumn[];
  message?: string;
  depart?: Departure;
  /** The rider list to keep, for a kind whose players choose their seat; undefined otherwise (ADR 0120). */
  seatLayout?: SeatAssignment;
  boardDeckRiders: boolean;
  impulse: Vec3;
  yaw: number;
  /** Where the kind's stand-in stands; undefined for a kind without one (ADR 0116). */
  standIn?: StandInPose;
  hits: RamHit[];
  driverId?: PlayerId;
  stepCommands: readonly EngineCommand[];
  finalCommands: readonly EngineCommand[];
  riders: RiderState;
}

export class Vehicle {
  private crew: Crew;
  private readonly ramCooldowns = new RamCooldowns();
  private readonly switchCooldown = new SwitchCooldown();
  // Its own cooldown, so a driver's headlight switch and a ceiling light switch in the room never block each other (ADR 0115).
  private readonly ceilingLightCooldown = new SwitchCooldown();
  private hitCounter: HitCounter = EMPTY_COUNTER;
  /** As of the last tick: held in place (ADR 0063, 0068), and nobody in the driver's seat or its deck seat. */
  private docked = false;
  private driverSeatFree = true;
  /** The row axis of the stand-in kept last tick; a rebuilt vehicle starts with none (ADR 0116). */
  private standInAxis: StandInAxis | undefined;

  /** Called only by kinds/index.ts, which picks the drive for the kind. */
  constructor(
    readonly id: VehicleId,
    private readonly profile: VehicleProfile,
    private readonly drive: Drive,
  ) {
    this.crew = new Crew(profile);
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
    vehicle.crew = Crew.restore(profile, riders, forward(yaw));
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
  headlightCells(location: Vec3): LitCell[] {
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
      hasRiders: this.crew.occupied,
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

  /**
   * A player on foot asks to get in, with their eye at `eye` from the vehicle's feet and
   * looking along `view`, or with no `view` to pick the seat nearest where they stand.
   * For a kind whose players choose their seat, the next tick seats them in the free seat
   * they aim at, and this returns true; otherwise it returns false and the engine seats
   * them (ADR 0120).
   */
  requestSeat(playerId: PlayerId, eye: Vec3, view?: Vec3): boolean {
    const f = forward(this.drive.yaw);
    const local = (v: Vec3): Vec3 => ({ ...toLocal(v, f), y: v.y });
    return this.crew.request(playerId, {
      eye: local(eye),
      view: view && local(view),
    });
  }

  /** A player tapped the door of this vehicle's room at `tick`. Returns whether it opened or closed (ADR 0068, 0105). */
  useDockDoor(tick: number): boolean {
    return this.drive.useDockDoor?.(tick) ?? false;
  }

  /** A player with feet at `feet` pressed the shower-toilet at `tick`. Returns whether its door swung or its shower ran (ADR 0094, 0098, 0105, 0118). */
  pressShowerToilet(feet: Vec3, tick: number): boolean {
    return this.drive.pressShowerToilet?.(feet, tick) ?? false;
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

  /** A player pressed storage with doors, such as the wall cabinet, at world `cell` at `tick`. Returns what the press did, if anything (ADR 0114, 0121). */
  pressStorage(
    cell: Vec3,
    point: Vec3 | undefined,
    tick: number,
  ): StoragePress | undefined {
    return this.drive.pressStorage?.(cell, point, tick);
  }

  /** Called by the application when this tick's step commands may not have reached the entity (ADR 0055, 0127). */
  resync(): void {
    this.drive.resync();
  }

  tick(input: VehicleTickInput): TickOutcome {
    const { riders, testInput, deckSeatRiders, targets, ...sensors } = input;
    const seated = this.crew.update(
      riders,
      forward(this.drive.yaw),
      sensors.velocity,
    );
    const vacatedCommands = seated.vacated.flatMap((seat) =>
      this.drive.onSeatVacated(seat),
    );
    const takenCommands = seated.boarded.flatMap(
      (seat) => this.drive.onSeatTaken?.(seat) ?? [],
    );
    const driver = seated.driver;
    if (seated.mounted && driver) this.drive.onDriverMounted(driver.yaw);

    const raw = driver?.raw ?? testInput;
    const taken = this.crew.taken();
    const deckSeatInputs = sensors.deckSeatInputs.map((deckInput, seat) =>
      taken.has(seat) ? undefined : deckInput,
    );
    const step = this.drive.step(raw, {
      ...sensors,
      awaitingDriver: seated.awaitingDriver,
      deckSeatInputs,
    });
    this.docked = step.dock !== undefined;
    const seatLayout = this.crew.layout(
      riders,
      deckSeatRiders ?? [],
      step.boardDeckRiders ?? false,
    );
    // A deck seat's input is defined only while a player sits in it.
    this.driverSeatFree =
      !taken.has(DRIVER_SEAT) && deckSeatInputs[DRIVER_SEAT] === undefined;

    return {
      dock: step.dock && {
        ...step.dock,
        seats: step.dock.seats.map((at, seat) =>
          taken.has(seat) ? undefined : at,
        ),
      },
      clear: step.clear ?? [],
      cut: step.cut ?? [],
      message: step.message,
      depart: step.depart,
      seatLayout,
      boardDeckRiders: step.boardDeckRiders ?? false,
      impulse: step.impulse,
      yaw: this.drive.yaw,
      standIn: this.standIn(step.dock?.hold, sensors),
      hits: this.ram(sensors.tick, targets, step.forward),
      driverId: driver?.id,
      stepCommands: step.commands,
      finalCommands: [...vacatedCommands, ...takenCommands],
      riders: step.riders,
    };
  }

  /**
   * The stand-in at the vehicle's heading after this step, from its hold pose while held
   * or its location before this tick's move while driving: the move is applied after this
   * tick's world calls, so a driving stand-in trails the body by one tick (ADR 0116).
   * It rises out of solid ground in its middle cell, less far while held (ADR 0119).
   */
  private standIn(
    hold: Vec3 | undefined,
    sensors: Pick<TickContext, "location" | "solidAt">,
  ): StandInPose | undefined {
    const rule = this.profile.standIn;
    if (!rule) return undefined;
    const yaw = this.drive.yaw;
    this.standInAxis = standInAxis(yaw, this.standInAxis, rule.turnMargin);
    const pose = standInPose(
      rule,
      hold ?? sensors.location,
      yaw,
      this.standInAxis,
    );
    const maxLift = hold
      ? Math.min(
          rule.maxLift ?? 0,
          rule.parkedMaxLift ?? Number.POSITIVE_INFINITY,
        )
      : (rule.maxLift ?? 0);
    if (maxLift <= 0) return pose;
    // solidAt reads the block at an offset from the entity's location; the half block
    // picks the middle of each layer above the stand-in's feet.
    return liftStandIn(pose, maxLift, (layer) =>
      sensors.solidAt({
        x: pose.x - sensors.location.x,
        y: pose.y - sensors.location.y + layer + HALF_BLOCK,
        z: pose.z - sensors.location.z,
      }),
    );
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
      this.profile.body,
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
    if (playerId !== this.crew.driver) return false;
    return this.switchCooldown.tryUse(tick, SPEC.headlightSwitchCooldown);
  }

  /**
   * A player who is not at the wheel uses the light switch with their feet at `feet`: inside a
   * parked room, it turns the ceiling lights on or off. The driver's switch stays the
   * headlights' (ADR 0020). It uses its own cooldown with the headlight switch's duration, so
   * one touch flips once (ADR 0024, 0115). Returns whether it flipped.
   */
  switchCeilingLights(playerId: PlayerId, feet: Vec3, tick: number): boolean {
    if (playerId === this.crew.driver || !this.drive.switchCeilingLights)
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
    if (playerId === this.crew.driver) return false;
    return this.drive.ceilingLightsReachable?.(feet) ?? false;
  }

  /** Hit by a player. Returns whether the vehicle breaks (ADR 0008). */
  receiveHit(tick: number): boolean {
    const r = registerHit(this.hitCounter, tick, this.crew.occupied, {
      hits: SPEC.hitsToBreak,
      resetTicks: SPEC.hitResetTicks,
    });
    this.hitCounter = r.counter;
    return r.broken;
  }
}
