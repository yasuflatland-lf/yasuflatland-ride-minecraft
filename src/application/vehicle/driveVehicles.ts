// Use case: every tick, move all loaded vehicles.
import { rebuildVehicle } from "../../domain/vehicle/kinds/index";
import type { ChaseCamera } from "../../domain/vehicle/profile";
import { SPEC } from "../../domain/vehicle/spec";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DriveWorld, Logger } from "./ports";

export class DriveVehicles {
  /** Players this use case switched to a third-person camera, and which one (ADR 0028). */
  private readonly thirdPerson = new Map<string, ChaseCamera>();
  /** Players whose camera switch failed and was logged, so a retry every tick logs once. */
  private readonly cameraFailed = new Set<string>();

  constructor(
    private readonly world: DriveWorld,
    private readonly repo: VehicleRepository,
    private readonly log: Logger,
  ) {}

  execute(tick: number): void {
    const seen = new Set<string>();
    const offRoad = new Map<string, ChaseCamera>();
    const underwater = new Set<string>();
    for (const snap of this.world.loadedVehicles()) {
      seen.add(snap.id);
      try {
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
          for (const rider of snap.riders) offRoad.set(rider.id, camera);
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
      } catch (e) {
        // A failure in one vehicle must not stop the others.
        this.log.warn(`${snap.id}: ${e}`);
      }
    }
    for (const id of this.repo.ids()) {
      if (seen.has(id)) continue;
      this.repo.remove(id);
      // Each release runs on its own so one failure does not skip the others.
      for (const release of [
        () => this.world.keepDeckSeats(id, [], 0),
        () => this.world.shineHeadlights(id, []),
        () => this.world.layDock(id, []),
        () => this.world.holdAt(id, undefined),
      ]) {
        try {
          release();
        } catch (e) {
          this.log.warn(`${id}: ${e}`);
        }
      }
    }
    this.syncCameras(offRoad);
    if (tick % SPEC.waterBreathingInterval === 0)
      this.refreshWaterBreathing(underwater);
  }

  private refreshWaterBreathing(underwater: ReadonlySet<string>): void {
    for (const id of underwater) {
      try {
        this.world.giveWaterBreathing(id, SPEC.waterBreathingTicks);
      } catch (e) {
        // One failed refresh must not skip the other riders.
        this.log.warn(`breathing ${id}: ${e}`);
      }
    }
  }

  /**
   * Each drive chooses its riders' view; everyone this use case switched
   * gets their own view back when requested or when they get off. A failed
   * switch either way is retried on the next tick. A player who left needs no
   * clearing: the world does nothing for a missing player, so they are dropped.
   */
  private syncCameras(offRoad: ReadonlyMap<string, ChaseCamera>): void {
    for (const [id, camera] of offRoad)
      if (this.thirdPerson.get(id) !== camera && this.switchCamera(id, camera))
        this.thirdPerson.set(id, camera);
    for (const id of this.thirdPerson.keys())
      if (!offRoad.has(id) && this.switchCamera(id, undefined))
        this.thirdPerson.delete(id);
  }

  private switchCamera(id: string, camera: ChaseCamera | undefined): boolean {
    try {
      this.world.setChaseCamera(id, camera);
      this.cameraFailed.delete(id);
      return true;
    } catch (e) {
      if (!this.cameraFailed.has(id)) this.log.warn(`camera ${id}: ${e}`);
      this.cameraFailed.add(id);
      return false;
    }
  }
}
