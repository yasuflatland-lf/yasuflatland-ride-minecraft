import type { PlayerId, VehicleId } from "../../domain/shared/ids";
// Use case: every tick, move all loaded vehicles.
import { rebuildVehicle } from "../../domain/vehicle/kinds/index";
import type { ChaseCamera } from "../../domain/vehicle/profile";
import type { TickOutcome } from "../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import { forEachIsolated } from "./isolated";
import type { DriveWorld, VehicleSnapshot } from "./ports/drive";
import type { Logger } from "./ports/shared";
import { RiderEffects } from "./riderEffects";

export class DriveVehicles {
  private readonly riders: RiderEffects;

  constructor(
    private readonly world: DriveWorld,
    private readonly repo: VehicleRepository,
    private readonly log: Logger,
  ) {
    this.riders = new RiderEffects(world, log);
  }

  execute(tick: number): void {
    const seen = new Set<VehicleId>();
    const thirdPersonRiders = new Map<PlayerId, ChaseCamera>();
    const underwater = new Set<PlayerId>();
    const fireProtected = new Set<PlayerId>();
    // A failure in one vehicle must not stop the others.
    forEachIsolated(
      this.world.loadedVehicles(),
      (snap) => {
        seen.add(snap.id);
        this.tickVehicle(
          snap,
          tick,
          thirdPersonRiders,
          underwater,
          fireProtected,
        );
      },
      this.log,
      (snap) => snap.id,
    );
    this.releaseGone(seen);
    this.riders.syncCameras(thirdPersonRiders);
    this.riders.refreshWaterBreathing(underwater, tick);
    this.riders.protectFromFire(fireProtected);
  }

  private tickVehicle(
    snap: VehicleSnapshot,
    tick: number,
    thirdPersonRiders: Map<PlayerId, ChaseCamera>,
    underwater: Set<PlayerId>,
    fireProtected: Set<PlayerId>,
  ): void {
    let vehicle = this.repo.get(snap.id);
    if (!vehicle) {
      // The aggregate is lost after a reload: rebuild it with zero speed,
      // the entity's heading, the riders already seated (so the current
      // driver is not treated as newly mounted), and its restored properties
      // stored on the entity (ADR 0021, 0039).
      vehicle = rebuildVehicle(
        snap.kind,
        snap.id,
        snap.yaw,
        snap.riders,
        snap.restored(),
      );
      this.repo.save(vehicle);
    }
    let out: TickOutcome;
    try {
      out = vehicle.tick({
        tick,
        riders: snap.riders,
        deckSeatInputs: snap.deckSeatInputs,
        deckSeatRiders: snap.deckSeatRiders,
        testInput: snap.testInput,
        testHeldTool: snap.testHeldTool,
        location: snap.location,
        velocity: snap.velocity,
        onGround: snap.onGround,
        waterAt: (offset) => this.world.waterAt(snap.id, offset),
        lavaAt: (offset) => this.world.lavaAt(snap.id, offset),
        solidAt: (offset) => this.world.solidAt(snap.id, offset),
        blockTypes: (cells) => this.world.blockTypes(snap.id, cells),
        targets: () => this.world.targetsNear(snap.id),
      });
      // Latches advance while building commands; a failed tick or send must retry every value (ADR 0127).
      this.world.run(snap.id, out.stepCommands);
    } catch (error) {
      vehicle.resync();
      throw error;
    }
    if (out.message && out.driverId)
      this.world.showMessage(out.driverId, out.message);
    this.world.holdAt(snap.id, out.dock?.hold);
    if (out.clear.length > 0) this.world.clearBlocks(snap.id, out.clear);
    if (out.cut.length > 0) this.world.cutColumns(snap.id, out.cut);
    if (out.riders.thirdPerson) {
      const camera = vehicle.chaseCamera;
      for (const rider of snap.riders) thirdPersonRiders.set(rider.id, camera);
    }
    if (out.riders.underwater)
      for (const rider of snap.riders) underwater.add(rider.id);
    if (snap.kind === "sportsboat") {
      for (const rider of snap.riders) fireProtected.add(rider.id);
      for (const rider of snap.deckSeatRiders)
        if (rider !== undefined) fireProtected.add(rider);
    }
    if (!out.dock) this.world.applyMotion(snap.id, out.impulse, out.yaw);
    if (out.seatLayout) this.world.keepSeatLayout(snap.id, out.seatLayout);
    if (out.boardDeckRiders) this.world.boardDeckRiders(snap.id);
    if (out.depart) this.world.seatStandingPlayers(snap.id, out.depart);
    this.world.keepDeckSeats(snap.id, out.dock?.seats ?? [], out.yaw);
    this.world.keepStandIn(snap.id, out.standIn);
    this.world.layDock(snap.id, out.dock?.cells ?? []);
    this.world.shineHeadlights(
      snap.id,
      snap.headlights ? vehicle.headlightCells(snap.location) : [],
    );
    for (const hit of out.hits) this.world.damage(hit, out.driverId);
    this.world.run(snap.id, out.finalCommands);
    for (const exit of out.exits)
      this.world.standRiderAt(snap.id, exit.playerId, exit.at);
  }

  private releaseGone(seen: ReadonlySet<VehicleId>): void {
    const gone = this.repo.ids().filter((id) => !seen.has(id));
    for (const id of gone) this.repo.remove(id);
    // One failed release must not skip the other vehicles.
    forEachIsolated(
      gone,
      (id) => this.world.releaseVehicle(id),
      this.log,
      (id) => id,
    );
  }
}
