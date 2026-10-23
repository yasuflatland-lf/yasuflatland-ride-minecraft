import type { DecorPlacingWorld } from "../../../src/application/vehicle/ports/decor";
import type {
  DriveWorld,
  HintPlayerView,
  HintVehicleView,
  HintWorld,
  VehicleSnapshot,
} from "../../../src/application/vehicle/ports/drive";
import type {
  BreakWorld,
  LimitWorld,
} from "../../../src/application/vehicle/ports/fleet";
import type { HeadlightWorld } from "../../../src/application/vehicle/ports/headlights";
import type { PaintWorld } from "../../../src/application/vehicle/ports/paint";
import type {
  GiftBoxWorld,
  PlacementWorld,
  StarterWorld,
} from "../../../src/application/vehicle/ports/placement";
import type { Clock } from "../../../src/application/vehicle/ports/shared";
import { asVehicleId, type VehicleId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import type { DecorPlacement } from "../../../src/domain/vehicle/dock/decor";
import type {
  ClearCell,
  Departure,
} from "../../../src/domain/vehicle/dock/dock";
import type {
  DockCell,
  HoldPose,
} from "../../../src/domain/vehicle/dock/floor";
import type { EngineCommand } from "../../../src/domain/vehicle/drive";
import {
  Fleet,
  type FleetEntry,
  type FleetLimitOf,
  type FleetState,
} from "../../../src/domain/vehicle/fleet/fleet";
import type { FleetRepository } from "../../../src/domain/vehicle/fleet/fleetRepository";
import type { Hint } from "../../../src/domain/vehicle/hints";
import type { VehicleKind } from "../../../src/domain/vehicle/kind";
import { parkPose } from "../../../src/domain/vehicle/kinds/camper/room";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import {
  type Cell,
  cellKey,
} from "../../../src/domain/vehicle/lighting/headlights";
import type { Paint } from "../../../src/domain/vehicle/paint/paint";
import type { PlacementGift } from "../../../src/domain/vehicle/placement/gift";
import type { ChaseCamera } from "../../../src/domain/vehicle/profile";
import type { RamHit, RamTarget } from "../../../src/domain/vehicle/ram";
import type { StandInPose } from "../../../src/domain/vehicle/standIn";
import type { Vehicle } from "../../../src/domain/vehicle/vehicle";
import type { VehicleRepository } from "../../../src/domain/vehicle/vehicleRepository";
import { waterSensors } from "../../support/waterDepth";

export class FakeClock implements Clock {
  tick = 0;
  now() {
    return this.tick;
  }
}

export class InMemoryRepo implements VehicleRepository {
  readonly map = new Map<VehicleId, Vehicle>();
  get(id: VehicleId) {
    return this.map.get(id);
  }
  save(v: Vehicle) {
    this.map.set(v.id, v);
  }
  remove(id: VehicleId) {
    this.map.delete(id);
  }
  ids() {
    return [...this.map.keys()];
  }
}

export class FakeFleetRepository implements FleetRepository {
  state: FleetState;
  saves = 0;
  constructor(private readonly limitOf: FleetLimitOf) {
    this.state = Fleet.empty(limitOf).state();
  }
  load() {
    return Fleet.restore(this.state, this.limitOf);
  }
  save(fleet: Fleet) {
    this.state = fleet.state();
    this.saves++;
  }
}

export class FakeWorld
  implements
    DriveWorld,
    PlacementWorld,
    StarterWorld,
    BreakWorld,
    PaintWorld,
    HeadlightWorld,
    LimitWorld,
    DecorPlacingWorld,
    GiftBoxWorld
{
  readonly creativePlayers = new Set<string>();
  isCreative(playerId: string) {
    return this.creativePlayers.has(playerId);
  }
  snapshots: VehicleSnapshot[] = [];
  loaded: FleetEntry[] = [];
  targets: RamTarget[] = [];
  readonly paints = new Map<string, Paint>();
  readonly kinds = new Map<string, VehicleKind>();
  readonly owners = new Map<string, string>();
  readonly headlights = new Map<string, boolean>();
  /** Players in the world, and whether each has received the starter item. */
  readonly starters = new Map<string, boolean>();
  /** The cells each vehicle was last told to light. */
  readonly shone = new Map<string, readonly Cell[]>();
  readonly held = new Map<string, HoldPose | undefined>();
  /** The stand-in pose each vehicle kept last (ADR 0116). */
  readonly standIns = new Map<string, StandInPose | undefined>();
  readonly docks = new Map<string, readonly DockCell[]>();
  readonly typesAt = new Map<string, string>();
  readonly cleared: { vehicleId: string; cells: readonly ClearCell[] }[] = [];
  readonly messages: { playerId: string; name: string }[] = [];
  readonly departures: { vehicleId: string; departure: Departure }[] = [];
  air = (_at: Vec3) => true;
  /** Which cells hold water; dry everywhere unless a test says otherwise. */
  water = (_at: Vec3) => false;
  /** The dimension of every water query, in order. */
  readonly waterDimensions: string[] = [];
  /** Whether the slot a vehicle item was used from still holds one. */
  itemInSlot = true;
  /** Players who left the world; gift queries return undefined for them. */
  readonly absentPlayers = new Set<string>();
  /** `${playerId}:${gift}` for every gift a player has received. */
  readonly giftsReceived = new Set<string>();
  /** Whether the slot a gift box was used from still holds one. */
  giftInSlot = true;
  failOn: string | undefined;
  failRunOn: { id: string; name: string } | undefined;
  failCameraOn: string | undefined;
  failBreathingOn: string | undefined;
  failRemoveOn: string | undefined;
  failReleaseOn: string | undefined;
  /**
   * Fails the `call`-th `run` (counted from 0 over every vehicle's runs) when it returns
   * an index: the commands before that index reach the entity, then `run` throws. An
   * index past the last command sends them all, then throws.
   */
  runFault: ((id: string, call: number) => number | undefined) | undefined;
  private runCalls = 0;
  readonly calls: string[] = [];
  private nextId = 1;

  blockTypes(
    _vehicleId: string,
    cells: readonly Vec3[],
  ): (string | undefined)[] {
    this.calls.push("blockTypes");
    return cells.map((c) => this.typesAt.get(cellKey(c)) ?? "minecraft:air");
  }
  clearBlocks(vehicleId: string, cells: readonly ClearCell[]) {
    this.calls.push("clearBlocks");
    this.cleared.push({ vehicleId, cells });
  }
  showMessage(playerId: string, name: string) {
    this.calls.push("showMessage");
    this.messages.push({ playerId, name });
  }
  consumeDecorItem(playerId: string, hotbarSlot: number, item: string) {
    if (!this.itemInSlot) return false;
    this.calls.push(`consumeDecor:${playerId}:${hotbarSlot}:${item}`);
    return true;
  }
  giveDecorItems(playerId: string, items: readonly string[]) {
    this.calls.push(`giveDecor:${playerId}:${items.join(",")}`);
  }
  saveDecor(vehicleId: string, decor: readonly DecorPlacement[]) {
    this.calls.push(
      `saveDecor:${vehicleId}:${decor.map((d) => `${d.slot}=${d.item}`).join(",")}`,
    );
  }
  seatStandingPlayers(vehicleId: string, departure: Departure) {
    this.calls.push("seatStandingPlayers");
    this.departures.push({ vehicleId, departure });
  }
  loadedVehicles() {
    return this.snapshots;
  }
  loadedFleetEntries() {
    return this.loaded;
  }
  solidAt() {
    return false;
  }
  waterAt(id: string, offset: Vec3) {
    const snap = this.snapshots.find((s) => s.id === id);
    const waterAt = snap && waterQueries.get(snap);
    return waterAt ? waterAt(offset) : false;
  }
  targetsNear() {
    return this.targets;
  }
  holdAt(id: string, pose: HoldPose | undefined) {
    this.held.set(id, pose);
  }
  keepDeckSeats(
    _id: string,
    _positions: readonly (Vec3 | undefined)[],
    _yaw: number,
  ) {}
  /** The rider list each vehicle was last told to keep (ADR 0120). */
  readonly seatLayouts = new Map<string, readonly (string | undefined)[]>();
  keepSeatLayout(vehicleId: string, layout: readonly (string | undefined)[]) {
    this.calls.push("keepSeatLayout");
    this.seatLayouts.set(vehicleId, layout);
  }
  boardDeckRiders(_id: string) {
    this.calls.push("boardDeckRiders");
  }
  keepStandIn(id: string, pose: StandInPose | undefined) {
    this.standIns.set(id, pose);
  }
  layDock(id: string, cells: readonly DockCell[]) {
    this.calls.push("layDock");
    this.docks.set(id, cells);
  }
  applyMotion(id: string, _impulse: Vec3, yaw: number) {
    if (id === this.failOn) throw new Error("boom");
    this.calls.push(`motion:${id}:${yaw.toFixed(0)}`);
  }
  readonly properties = new Map<
    string,
    Record<string, string | number | boolean>
  >();
  run(id: string, commands: readonly EngineCommand[]) {
    const call = this.runCalls++;
    const fault = this.runFault?.(id, call);
    for (const [index, command] of commands.entries()) {
      if (index === fault) throw new Error("run fault");
      if (id === this.failRunOn?.id && command.name === this.failRunOn.name)
        throw new Error(`command ${command.name}`);
      if (command.type === "setProperty") {
        const properties = this.properties.get(id) ?? {};
        properties[command.name] = command.value;
        this.properties.set(id, properties);
        if (command.name === "form")
          this.calls.push(`form:${id}:${command.value}`);
        if (command.name === "bank")
          this.calls.push(`bank:${id}:${command.value}`);
        if (command.name === "gear_down")
          this.calls.push(`gear:${id}:${command.value ? "down" : "up"}`);
      }
      if (command.type === "playAnimation")
        this.calls.push(`door:${id}:${command.name}`);
    }
    if (fault !== undefined) throw new Error("run fault");
  }
  formOf(id: string) {
    return (
      this.properties.get(id)?.form ??
      this.snapshots.find((s) => s.id === id)?.restored().form ??
      "car"
    );
  }
  setChaseCamera(id: string, camera: ChaseCamera | undefined) {
    if (id === this.failCameraOn) throw new Error("camera");
    const view = { near: "third", far: "far" }[camera ?? "near"];
    this.calls.push(`camera:${id}:${camera ? view : "own"}`);
  }
  giveWaterBreathing(id: string, ticks: number) {
    if (id === this.failBreathingOn) throw new Error("breathing");
    this.calls.push(`breathing:${id}:${ticks}`);
  }
  damage(hit: RamHit, attackerId: string | undefined) {
    this.calls.push(`damage:${hit.id}:${attackerId ?? "-"}`);
  }
  shineHeadlights(id: string, cells: readonly Cell[]) {
    this.shone.set(id, cells);
  }
  releaseVehicle(id: string) {
    if (id === this.failReleaseOn) throw new Error("release");
    this.calls.push(`release:${id}`);
  }
  headlightsOn(id: string) {
    return this.headlights.get(id);
  }
  setHeadlights(id: string, on: boolean) {
    this.headlights.set(id, on);
    this.calls.push(`headlights:${id}:${on}`);
  }
  isAir(_dim: string, at: Vec3) {
    return this.air(at);
  }
  isWaterAt(dim: string, at: Vec3) {
    this.waterDimensions.push(dim);
    return this.water(at);
  }
  spawnVehicle(
    dim: string,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: string,
  ) {
    const id = asVehicleId(`v${this.nextId++}`);
    this.owners.set(id, ownerId);
    this.calls.push(`spawn:${dim}:${at.x},${at.y},${at.z}:${yaw}:${kind}`);
    return id;
  }
  consumeVehicleItem(playerId: string, slot: number, kind: VehicleKind) {
    if (!this.itemInSlot) return false;
    this.calls.push(`consume:${playerId}:${slot}:${kind}`);
    return true;
  }
  receivedStarter(playerId: string) {
    return this.starters.get(playerId);
  }
  giveVehicleItem(playerId: string, kind: VehicleKind) {
    this.calls.push(`give:${playerId}:${kind}`);
  }
  markStarterReceived(playerId: string) {
    this.starters.set(playerId, true);
    this.calls.push(`mark:${playerId}`);
  }
  receivedGift(playerId: string, gift: PlacementGift) {
    return this.absentPlayers.has(playerId)
      ? undefined
      : this.giftsReceived.has(`${playerId}:${gift}`);
  }
  giveGift(playerId: string, gift: PlacementGift) {
    this.calls.push(`gift:${playerId}:${gift}`);
  }
  markGiftReceived(playerId: string, gift: PlacementGift) {
    this.giftsReceived.add(`${playerId}:${gift}`);
    this.calls.push(`markGift:${playerId}:${gift}`);
  }
  consumeGift(playerId: string, gift: PlacementGift, slot: number) {
    if (!this.giftInSlot) return false;
    this.calls.push(`takeGift:${playerId}:${slot}:${gift}`);
    return true;
  }
  unpackGift(playerId: string, gift: PlacementGift) {
    this.calls.push(`unpack:${playerId}:${gift}`);
  }
  dropVehicleItem(id: string) {
    this.calls.push(`drop:${id}`);
  }
  removeVehicle(id: string) {
    if (id === this.failRemoveOn) throw new Error("remove");
    this.calls.push(`remove:${id}`);
  }
  paintOf(id: string) {
    return this.paints.get(id);
  }
  kindOf(id: string) {
    return this.paints.has(id) ? (this.kinds.get(id) ?? "suv") : undefined;
  }
  paint(id: string, paint: Paint) {
    this.paints.set(id, paint);
    this.calls.push(`paint:${id}:${paint}`);
  }
  consumeDye(playerId: string, paint: Paint) {
    this.calls.push(`dye:${playerId}:${paint}`);
  }
}

export class FakeHintWorld implements HintWorld {
  players: HintPlayerView[] = [];
  vehicles: HintVehicleView[] = [];
  playerScans = 0;
  readonly sent: { playerId: string; hint?: Hint }[] = [];
  hintPlayers() {
    this.playerScans++;
    return this.players;
  }
  hintVehicles() {
    return this.vehicles;
  }
  showHint(playerId: string, hint: Hint) {
    this.sent.push({ playerId, hint });
  }
  clearHint(playerId: string) {
    this.sent.push({ playerId });
  }
}

const waterQueries = new WeakMap<VehicleSnapshot, (offset: Vec3) => boolean>();

export const snapshot = (
  id: string,
  over: Partial<VehicleSnapshot> & {
    waterDepth?: number;
    waterBelow?: boolean;
  } = {},
): VehicleSnapshot => {
  const { waterDepth, waterBelow, ...fields } = over;
  const sensors = waterSensors(waterDepth, waterBelow);
  const snap: VehicleSnapshot = {
    id: asVehicleId(id),
    kind: "suv",
    location: sensors.location,
    yaw: 0,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    riders: [],
    deckSeatInputs: [],
    deckSeatRiders: [],
    restored: () => ({}),
    headlights: false,
    ...fields,
  };
  waterQueries.set(snap, sensors.waterAt);
  return snap;
};

/** A camper parked at (0.5, 64, 0.5) with its room laid; the next tick a test runs is tick(21). */
/** Ticks a riderless vehicle standing still on open ground at (0.5, 64, 0.5). */
export function stillTick(vehicle: Vehicle, time: number) {
  return vehicle.tick({
    tick: time,
    riders: [],
    deckSeatInputs: [],
    location: { x: 0.5, y: 64, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt: () => false,
    waterAt: () => false,
    targets: () => [],
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
  });
}

export function parkedCamper() {
  const repo = new InMemoryRepo();
  const car = createVehicle("camper", asVehicleId("car"), 0);
  repo.save(car);
  const tick = (time: number) => stillTick(car, time);
  for (let time = 0; time <= 20; time++) tick(time);
  return {
    car,
    pose: parkPose({ x: 0.5, y: 64, z: 0.5 }, car.yaw),
    repo,
    tick,
  };
}
