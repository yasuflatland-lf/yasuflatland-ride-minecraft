// Use case: every tick, move all loaded vehicles.
import { rebuildVehicle } from "../../domain/vehicle/kinds/index";
import type { ChaseCamera } from "../../domain/vehicle/profile";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import { forEachIsolated } from "./isolated";
import type { DriveWorld, Logger, VehicleSnapshot } from "./ports";
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
    const seen = new Set<string>();
    const thirdPersonRiders = new Map<string, ChaseCamera>();
    const underwater = new Set<string>();
    // A failure in one vehicle must not stop the others.
    forEachIsolated(
      this.world.loadedVehicles(),
      (snap) => {
        seen.add(snap.id);
        this.tickVehicle(snap, tick, thirdPersonRiders, underwater);
      },
      this.log,
      (snap) => snap.id,
    );
    this.releaseGone(seen);
    this.riders.syncCameras(thirdPersonRiders);
    this.riders.refreshWaterBreathing(underwater, tick);
  }

  private tickVehicle(
    snap: VehicleSnapshot,
    tick: number,
    thirdPersonRiders: Map<string, ChaseCamera>,
    underwater: Set<string>,
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
    const out = vehicle.tick({
      tick,
      riders: snap.riders,
      deckSeatInputs: snap.deckSeatInputs,
      testInput: snap.testInput,
      location: snap.location,
      velocity: snap.velocity,
      onGround: snap.onGround,
      waterAt: (offset) => this.world.waterAt(snap.id, offset),
      solidAt: (offset) => this.world.solidAt(snap.id, offset),
      blockTypes: (cells) => this.world.blockTypes(snap.id, cells),
      targets: () => this.world.targetsNear(snap.id),
    });
    // Commands are sent on change, so send them before anything else that could throw.
    this.world.run(snap.id, out.commands);
    if (out.message && out.driverId)
      this.world.showMessage(out.driverId, out.message);
    this.world.holdAt(snap.id, out.dock?.hold);
    if (out.clear.length > 0) this.world.clearBlocks(snap.id, out.clear);
    if (out.riders.thirdPerson) {
      const camera = vehicle.chaseCamera;
      for (const rider of snap.riders) thirdPersonRiders.set(rider.id, camera);
    }
    if (out.riders.underwater)
      for (const rider of snap.riders) underwater.add(rider.id);
    if (!out.dock) this.world.applyMotion(snap.id, out.impulse, out.yaw);
    if (out.boardDeckRiders) this.world.boardDeckRiders(snap.id);
    if (out.depart) this.world.seatStandingPlayers(snap.id, out.depart);
    this.world.keepDeckSeats(snap.id, out.dock?.seats ?? [], out.yaw);
    this.world.layDock(snap.id, out.dock?.cells ?? []);
    this.world.shineHeadlights(
      snap.id,
      snap.headlights ? vehicle.headlightCells(snap.location) : [],
    );
    for (const hit of out.hits) this.world.damage(hit, out.driverId);
    this.world.run(snap.id, out.seatCommands);
  }

  private releaseGone(seen: ReadonlySet<string>): void {
    for (const id of this.repo.ids()) {
      if (seen.has(id)) continue;
      this.repo.remove(id);
      // Each release runs on its own so one failure does not skip the others.
      forEachIsolated(
        [
          () => this.world.keepDeckSeats(id, [], 0),
          () => this.world.shineHeadlights(id, []),
          () => this.world.layDock(id, []),
          () => this.world.holdAt(id, undefined),
        ],
        (release) => release(),
        this.log,
        () => id,
      );
    }
  }
}
