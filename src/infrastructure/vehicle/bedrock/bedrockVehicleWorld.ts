// Composes the vehicle ports from shared Bedrock role adapters (ADR 0012).
import type { Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { VehicleHostState } from "../../../application/shared/ports/vehicleHost";
import type {
  DriveWorld,
  VehicleSnapshot,
} from "../../../application/vehicle/ports/drive";
import type {
  DimensionId,
  PlayerId,
  VehicleId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { CutColumn } from "../../../domain/vehicle/cut";
import type {
  ClearCell,
  DeckSeatSpot,
  Departure,
} from "../../../domain/vehicle/dock/dock";
import type { DockCell, HoldPose } from "../../../domain/vehicle/dock/floor";
import type { EngineCommand } from "../../../domain/vehicle/drive";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import type { LitCell } from "../../../domain/vehicle/lighting/headlights";
import type { Pave } from "../../../domain/vehicle/pave";
import type { ChaseCamera } from "../../../domain/vehicle/profile";
import type { RamHit, RamTarget } from "../../../domain/vehicle/ram";
import type { SeatAssignment } from "../../../domain/vehicle/seatChoice";
import type { StandInPose } from "../../../domain/vehicle/standIn";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { BedrockLoadedVehicles } from "./bedrockLoadedVehicles";
import { BedrockRiderEffects } from "./bedrockRiderEffects";
import { BedrockSurroundings } from "./bedrockSurroundings";
import { BedrockVehicleBlocks } from "./bedrockVehicleBlocks";
import { BedrockVehicleImpulse } from "./bedrockVehicleImpulse";
import { BedrockVehicleRiders } from "./bedrockVehicleRiders";
import { BedrockVehicleSpace } from "./bedrockVehicleSpace";
import { BladeCuts } from "./bladeCuts";
import { DeckSeats } from "./deckSeats";
import type { DockLayer } from "./dockLayer";
import { DropSweep } from "./dropSweep";
import type { EntityIndex } from "./entityIndex";
import { HeadlightBlocks } from "./headlightBlocks";
import { RoadPaver } from "./roadPaver";
import { SeatFillers } from "./seatFillers";
import { StandIns } from "./standIns";
import { systemClock } from "./systemClock";
import { VehicleReleaser } from "./vehicleReleaser";

export class BedrockVehicleWorld implements DriveWorld {
  private readonly loaded: BedrockLoadedVehicles;
  private readonly surroundings: BedrockSurroundings;
  private readonly impulse: BedrockVehicleImpulse;
  private readonly blocks: BedrockVehicleBlocks;
  private readonly riders: BedrockVehicleRiders;
  private readonly effects: BedrockRiderEffects;
  private readonly space: BedrockVehicleSpace;
  /** Shared with BedrockFleetWorld so a removed vehicle releases the same blocks, seats, stand-in and hold. */
  readonly releaser: VehicleReleaser;

  constructor(
    index: EntityIndex,
    testInputs: VehicleTestStore<RawInput>,
    testHeldItems: VehicleTestStore<string>,
    campSpace: SpaceCheck,
    dockBlocks: DockLayer,
    isStandableRoomBlock: (typeId: string) => boolean,
  ) {
    const standIns = new StandIns();
    const seatFillers = new SeatFillers();
    const holds = new Map<VehicleId, HoldPose>();
    const drops = new DropSweep(systemClock);
    const bladeCuts = new BladeCuts(systemClock, drops);
    const roadPaver = new RoadPaver(drops, campSpace);
    const headlightBlocks = new HeadlightBlocks(campSpace);
    const deckSeats = new DeckSeats(isStandableRoomBlock);
    this.releaser = new VehicleReleaser(
      headlightBlocks,
      dockBlocks,
      deckSeats,
      standIns,
      holds,
      seatFillers,
    );
    this.loaded = new BedrockLoadedVehicles(
      index,
      testInputs,
      testHeldItems,
      headlightBlocks,
      dockBlocks,
      deckSeats,
      standIns,
      seatFillers,
      holds,
      this.releaser,
    );
    this.surroundings = new BedrockSurroundings(index);
    this.impulse = new BedrockVehicleImpulse(index, holds);
    this.blocks = new BedrockVehicleBlocks(
      index,
      bladeCuts,
      roadPaver,
      dockBlocks,
      headlightBlocks,
    );
    this.riders = new BedrockVehicleRiders(
      index,
      deckSeats,
      seatFillers,
      standIns,
    );
    this.effects = new BedrockRiderEffects(index);
    this.space = new BedrockVehicleSpace(dockBlocks, (dimensionId, cell) =>
      this.dockCellOwner(dimensionId, cell),
    );
  }

  /** The vehicle whose laid room door is at this cell, if any (ADR 0068). */
  dockDoorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.space.dockDoorOwner(dimensionId, cell);
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  dockCellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.space.dockCellOwner(dimensionId, cell);
  }

  /** The vehicle whose laid dock block this is, while the world still holds it (ADR 0096). */
  dockBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined {
    return this.space.dockBlockOwner(dimensionId, cell, typeId);
  }

  /**
   * Whether a vehicle laid a room block in `cell` or in the block under it, or a
   * loaded vehicle's footprint, turned to any heading, reaches into `cell` at a height
   * within its kind's placement clearance (ADR 0122).
   */
  isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean {
    return this.space.isVehicleSpace(dimensionId, cell);
  }

  hostState(vehicleId: string): VehicleHostState {
    return this.loaded.hostState(vehicleId);
  }

  loadedVehicles(): VehicleSnapshot[] {
    return this.loaded.loadedVehicles();
  }

  waterAt(vehicleId: VehicleId, offset: Vec3): boolean {
    return this.surroundings.waterAt(vehicleId, offset);
  }

  lavaAt(vehicleId: VehicleId, offset: Vec3): boolean {
    return this.surroundings.lavaAt(vehicleId, offset);
  }

  solidAt(vehicleId: VehicleId, offset: Vec3): boolean {
    return this.surroundings.solidAt(vehicleId, offset);
  }

  blockTypes(
    vehicleId: VehicleId,
    cells: readonly Vec3[],
  ): (string | undefined)[] {
    return this.surroundings.blockTypes(vehicleId, cells);
  }

  clearBlocks(vehicleId: VehicleId, cells: readonly ClearCell[]): void {
    this.blocks.clearBlocks(vehicleId, cells);
  }

  cutColumns(vehicleId: VehicleId, columns: readonly CutColumn[]): void {
    this.blocks.cutColumns(vehicleId, columns);
  }

  pave(vehicleId: VehicleId, pave: Pave): void {
    this.blocks.pave(vehicleId, pave);
  }

  sweepCutDrop(entity: Entity): boolean {
    return this.blocks.sweepCutDrop(entity);
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.riders.showMessage(playerId, name);
  }

  seatStandingPlayers(vehicleId: VehicleId, departure: Departure): void {
    this.riders.seatStandingPlayers(vehicleId, departure);
  }

  targetsNear(vehicleId: VehicleId): RamTarget[] {
    return this.surroundings.targetsNear(vehicleId);
  }

  holdAt(vehicleId: VehicleId, pose: HoldPose | undefined): void {
    this.impulse.holdAt(vehicleId, pose);
  }

  keepDeckSeats(
    vehicleId: VehicleId,
    positions: readonly (DeckSeatSpot | undefined)[],
    yaw: number,
  ): void {
    this.riders.keepDeckSeats(vehicleId, positions, yaw);
  }

  standRiderAt(vehicleId: VehicleId, playerId: PlayerId, at: Vec3): void {
    this.riders.standRiderAt(vehicleId, playerId, at);
  }

  keepStandIn(vehicleId: VehicleId, pose: StandInPose | undefined): void {
    this.riders.keepStandIn(vehicleId, pose);
  }

  keepSeatLayout(vehicleId: VehicleId, layout: SeatAssignment): void {
    this.riders.keepSeatLayout(vehicleId, layout);
  }

  boardDeckRiders(vehicleId: VehicleId): void {
    this.riders.boardDeckRiders(vehicleId);
  }

  layDock(vehicleId: VehicleId, cells: readonly DockCell[]): void {
    this.blocks.layDock(vehicleId, cells);
  }

  applyMotion(vehicleId: VehicleId, impulse: Vec3, yaw: number): void {
    this.impulse.applyMotion(vehicleId, impulse, yaw);
  }

  run(vehicleId: VehicleId, commands: readonly EngineCommand[]): void {
    this.impulse.run(vehicleId, commands);
  }

  setChaseCamera(playerId: PlayerId, chase: ChaseCamera | undefined): void {
    this.effects.setChaseCamera(playerId, chase);
  }

  giveWaterBreathing(playerId: PlayerId, ticks: number): void {
    this.effects.giveWaterBreathing(playerId, ticks);
  }

  protectFromFire(playerId: PlayerId): void {
    this.effects.protectFromFire(playerId);
  }

  damage(hit: RamHit, attackerId: PlayerId | undefined): void {
    this.impulse.damage(hit, attackerId);
  }

  shineHeadlights(vehicleId: VehicleId, cells: readonly LitCell[]): void {
    this.blocks.shineHeadlights(vehicleId, cells);
  }

  releaseVehicle(vehicleId: VehicleId): void {
    this.loaded.releaseVehicle(vehicleId);
  }
}
