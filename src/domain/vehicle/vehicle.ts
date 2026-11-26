// Aggregate for one vehicle: wires its drive to its seating, cooldowns, and hit count.

import { Debounce } from "../shared/debounce";
import { HitCounters, hitRule } from "../shared/hitCounter";
import type { PlayerId, VehicleId } from "../shared/ids";
import { isDyeable } from "../shared/paint";
import { forward, type Vec2, type Vec3 } from "../shared/vec";
import { BOOST_CONTROL } from "./boost";
import type { CapabilityKey } from "./capability";
import type { InputControls } from "./controls";
import { Crew } from "./crew";
import type { CutColumn } from "./cut";
import type { ClearCell, Departure, Dock } from "./dock/dock";
import type { Drive, EngineCommand, RiderState, TickContext } from "./drive";
import type { RawInput } from "./driveInput";
import {
  type EquipmentSwitch,
  EquipmentSwitchboard,
} from "./equipment/equipment";
import {
  type HeldItem,
  type Hint,
  type HintName,
  hintAt,
  zoneOf,
} from "./hints";
import type { VehicleKind } from "./kind";
import {
  headlightCells as cellsLitFrom,
  type LitCell,
} from "./lighting/headlights";
import { CabMonitor } from "./monitor/monitor";
import type { Pave } from "./pave";
import type { ChaseCamera, VehicleProfile } from "./profile";
import { type RamHit, RamSensor, type RamTarget } from "./ram";
import { type RiderPoseCommand, RiderPoseState } from "./riderPose";
import type { SeatAssignment } from "./seatChoice";
import type { SeatLeaver } from "./seating";
import { DRIVER_SEAT, seatWorldPositions, toLocal } from "./seats";
import { SPEC } from "./spec";
import { StandInKeeper, type StandInPose } from "./standIn";

const TAKE_BACK_RULE = hitRule(SPEC.hitsToBreak, SPEC.hitResetTicks);

/** What a rider holds, read once per tick. The tool is the bare yasu_ride item ID for the monitor (ADR 0139); the block is the namespaced block the item places as itself (ADR 0181). Either may be absent. */
export interface RiderHeld {
  readonly tool?: string;
  readonly block?: string;
}

export interface RiderView {
  readonly id: PlayerId;
  readonly offset: Vec2;
  readonly yaw: number;
  readonly raw: RawInput;
  /** The rider's index in the engine's rider list, which is the seat it puts them in (ADR 0019). */
  readonly slot: number;
  /** Read only for kinds with a cab monitor (ADR 0139); its block feeds TickContext.heldBlock (ADR 0181). */
  readonly held?: RiderHeld;
}

export interface VehicleTickInput extends Omit<TickContext, "heldBlock"> {
  riders: readonly RiderView[];
  /** Input used only when there is no driver (for in-game tests). */
  testInput?: RawInput;
  /** Held item used only when there is no driver (for in-game tests, ADR 0139). */
  testHeld?: RiderHeld;
  /** The player on each deck seat, in deck seat order (ADR 0063, 0120). */
  deckSeatRiders?: readonly (PlayerId | undefined)[];
  /** Nearby targets. Called only when the speed exceeds the ram threshold (ADR 0083). */
  targets(): readonly RamTarget[];
}

/** A player who left a seat with an exit this tick, and the world point to put them (ADR 0141). */
export interface SeatExit {
  readonly playerId: PlayerId;
  readonly at: Vec3;
}

/**
 * The outcome of one vehicle tick.
 * @see [DriveVehicles.tickVehicle](../../application/vehicle/driveVehicles.ts) for world-call order.
 */
export interface TickOutcome {
  dock?: Dock;
  clear: readonly ClearCell[];
  cut: readonly CutColumn[];
  pave?: Pave;
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
  /** Own riders' pose changes and refreshes, applied after stepCommands within the resync boundary (ADR 0250). */
  riderPoses: readonly RiderPoseCommand[];
  finalCommands: readonly EngineCommand[];
  exits: readonly SeatExit[];
  riders: RiderState;
}

export class Vehicle {
  private crew: Crew;
  private readonly riderPoses = new RiderPoseState();
  private readonly equipment: EquipmentSwitchboard;
  private readonly monitor: CabMonitor;
  private readonly ram: RamSensor;
  private readonly standIn: StandInKeeper | undefined;
  private readonly switchCooldown = new Debounce(SPEC.headlightSwitchCooldown);
  private readonly boosterCooldown = new Debounce(SPEC.boosterSwitchCooldown);
  private readonly hitCounters = new HitCounters<PlayerId>(TAKE_BACK_RULE);
  /** As of the last tick: held in place (ADR 0063, 0068), and nobody in the driver's seat or its deck seat. */
  private held = false;
  private driverSeatFree = true;
  /** The held vehicle's wheel deck seat rider when the profile enables headlights there (ADR 0149). */
  private deckDriverId: PlayerId | undefined;

  /** Called only by kinds/index.ts, which picks the drive for the kind. */
  constructor(
    readonly id: VehicleId,
    private readonly profile: VehicleProfile,
    private readonly drive: Drive,
  ) {
    this.crew = new Crew(profile);
    this.equipment = new EquipmentSwitchboard(profile.equipment, drive);
    this.monitor = new CabMonitor(profile.equipment, (item) => {
      const equipmentSwitch = profile.equipment?.switches.find(
        (entry) => entry.item === item,
      );
      return equipmentSwitch && this.equipment.equipmentState(equipmentSwitch);
    });
    this.ram = new RamSensor(profile);
    this.standIn = profile.standIn
      ? new StandInKeeper(profile.standIn)
      : undefined;
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

  get driverId(): PlayerId | undefined {
    return this.crew.driver;
  }

  get riderIds(): readonly PlayerId[] {
    return [...this.crew.riders()];
  }

  isRider(playerId: PlayerId): boolean {
    return this.crew.riders().has(playerId);
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
    controls: InputControls,
    current?: HintName,
  ): Hint | undefined {
    const view = {
      kind: this.kind,
      offset,
      yaw: this.drive.yaw,
      isHeld: this.held,
      driverSeatFree: this.driverSeatFree,
      hasRiders: this.crew.occupied,
      dyeable: isDyeable(this.profile.paintPolicy),
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

  capability<T>(key: CapabilityKey<T>): T | undefined {
    return this.drive.capability?.(key);
  }

  cargo(): readonly string[] {
    return this.drive.cargo?.() ?? [];
  }

  /** Called by the application when this tick's step commands may not have reached the entity (ADR 0055, 0127). */
  resync(): void {
    this.drive.resync();
    this.monitor.resync();
    this.riderPoses.resync();
  }

  tick(input: VehicleTickInput): TickOutcome {
    const { riders, testInput, testHeld, deckSeatRiders, targets, ...sensors } =
      input;
    const previousDriver = this.crew.driver;
    const seated = this.crew.update(riders, forward(this.drive.yaw));
    const vacatedCommands = seated.left.flatMap(({ seat }) =>
      this.drive.onSeatVacated(seat),
    );
    const takenCommands = seated.boarded.flatMap(
      (seat) => this.drive.onSeatTaken?.(seat) ?? [],
    );
    const driver = seated.driver;
    if (previousDriver !== undefined && driver === undefined)
      this.drive.onDriverLeft?.();
    if (seated.mounted && driver) this.drive.onDriverMounted(driver.yaw);

    const held = driver ? driver.held : testHeld;
    const raw = driver?.raw ?? testInput;
    const taken = this.crew.taken();
    const deckSeatInputs = sensors.deckSeatInputs.map((deckInput, seat) =>
      taken.has(seat) ? undefined : deckInput,
    );
    const step = this.drive.step(raw, {
      ...sensors,
      heldBlock: held?.block,
      awaitingDriver: seated.awaitingDriver,
      deckSeatInputs,
    });
    const monitor = this.monitor.commands(held?.tool);
    this.held = step.dock !== undefined;
    this.deckDriverId =
      this.held && this.profile.deckSeatDriverHeadlights
        ? deckSeatRiders?.[DRIVER_SEAT]
        : undefined;
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
      pave: step.pave,
      message: step.message,
      depart: step.depart,
      seatLayout,
      boardDeckRiders: step.boardDeckRiders ?? false,
      impulse: step.impulse,
      yaw: this.drive.yaw,
      standIn: this.standIn?.pose(this.drive.yaw, step.dock?.hold, sensors),
      hits: this.ram.hits(
        sensors.tick,
        this.drive.speed,
        targets,
        step.forward,
        step.ramHalfWidth,
      ),
      driverId: driver?.id,
      stepCommands:
        monitor.length === 0 ? step.commands : [...step.commands, ...monitor],
      riderPoses: this.profile.riderPose
        ? this.riderPoses.next(
            this.profile.riderPose,
            riders.map((r) => ({ id: r.id, slot: r.slot })),
            step.riderLean ?? 0,
            sensors.tick,
          )
        : [],
      finalCommands: [...vacatedCommands, ...takenCommands],
      exits: this.seatExits(seated.left, step.dock?.hold ?? sensors.location),
      riders: step.riders,
    };
  }

  /**
   * The exit of each leaver whose seat has one, around the hold pose while held or the
   * location before this tick's move while driving, at the heading after this step (ADR 0141).
   */
  private seatExits(leavers: readonly SeatLeaver[], origin: Vec3): SeatExit[] {
    const { x, y, z } = origin;
    const pose = { x, y, z, yaw: this.drive.yaw };
    const exits: SeatExit[] = [];
    for (const { id, seat } of leavers) {
      const exit = this.profile.seatExits?.[seat];
      if (exit === undefined) continue;
      const [at] = seatWorldPositions(pose, [exit]);
      if (at) exits.push({ playerId: id, at });
    }
    return exits;
  }

  /**
   * The driver holds the wheel, as does the wheel deck seat rider of a held vehicle
   * whose profile enables deckSeatDriverHeadlights (ADR 0149). Their switch operates the headlights only.
   */
  atTheWheel(playerId: PlayerId): boolean {
    return playerId === this.driverId || playerId === this.deckDriverId;
  }

  /** A burst of uses from one touch at the wheel flips the headlights once (ADR 0024). */
  flipHeadlightSwitch(playerId: PlayerId, tick: number): boolean {
    return this.atTheWheel(playerId) && this.switchCooldown.press(tick);
  }

  switchBoost(
    playerId: PlayerId,
    tick: number,
  ): "on" | "off" | "unavailable" | "denied" {
    if (playerId !== this.driverId) return "denied";
    const boost = this.capability(BOOST_CONTROL);
    if (boost === undefined) return "unavailable";
    if (!this.boosterCooldown.press(tick)) return "denied";
    return boost.toggle() ? "on" : "off";
  }

  switchEquipment(
    playerId: PlayerId,
    equipmentSwitch: EquipmentSwitch,
    tick: number,
  ): boolean {
    return this.equipment.switchEquipment(
      playerId === this.driverId,
      equipmentSwitch,
      tick,
    );
  }

  equipmentState<S extends string>(
    equipmentSwitch: EquipmentSwitch<S>,
  ): S | undefined {
    return this.equipment.equipmentState(equipmentSwitch);
  }

  forceEquipment(equipmentSwitch: EquipmentSwitch, state: string): boolean {
    return this.equipment.forceEquipment(equipmentSwitch, state);
  }

  /** Hit by a player. Returns whether the vehicle breaks (ADR 0008). */
  receiveHit(playerId: PlayerId, tick: number): boolean {
    if (this.crew.occupied) return false;
    this.hitCounters.forgetStale(tick);
    return this.hitCounters.hit(playerId, tick).broken;
  }
}
