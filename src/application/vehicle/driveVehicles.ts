import type { PlayerId, VehicleId } from "../../domain/shared/ids";
// Use case: every tick, move all loaded vehicles.
import { profileOf, rebuildVehicle } from "../../domain/vehicle/kinds/index";
import type { ChaseCamera } from "../../domain/vehicle/profile";
import type { TickOutcome } from "../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import { attempt, forEachIsolated } from "../shared/isolated";
import type { Logger } from "../shared/ports/logger";
import type { DriveWorld, VehicleSnapshot } from "./ports/drive";
import { RiderEffects } from "./riderEffects";

export class DriveVehicles {
  private readonly pendingRelease = new Set<VehicleId>();
  private readonly warnedRelease = new Set<VehicleId>();

  constructor(
    private readonly world: DriveWorld,
    private readonly repo: VehicleRepository,
    private readonly log: Logger,
    private readonly riders = new RiderEffects(world, log),
  ) {}

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
    attempt(() => this.world.sweepGone(seen), this.log, "sweep gone vehicles");
    this.releaseGone(seen);
    this.riders.syncCameras(thirdPersonRiders);
    this.riders.refreshWaterBreathing(underwater, tick);
    this.riders.protectFromFire(fireProtected);
  }

  /**
   * A throw skips the remaining calls for this vehicle (ADR 0055). Hold, deck seats,
   * stand-in, dock cells and headlights are reconciled every tick so they can release
   * what the vehicle kept on an earlier tick.
   *
   * 1. `stepCommands`: the drive's commands, then the cab monitor's screen (ADR 0139),
   *    in order, before anything else that could throw,
   *    because drives send them only on change (ADR 0055); if they fail, the vehicle
   *    resyncs and sends every value again next tick (ADR 0127).
   * 2. `riderPoses`: own riders' pose changes and refreshes, within the stepCommands
   *    failure boundary so a failed send resyncs their poses too (ADR 0250).
   * 3. `message` on the action bar of `driverId`, only when there is one.
   * 4. `dock.hold`; with no `dock`, the hold is released (ADR 0063, 0064).
   * 5. `clear`, when not empty, before the dock's cells are laid (ADR 0068).
   * 6. `cut`, when not empty, right after `clear` and before the move, so the
   *    body moves into the cleared strip on the same tick (ADR 0137).
   * 7. `pave`, when it has cells, right after `cut` and before the move, so the
   *    body moves onto a road laid on the same tick (ADR 0181).
   * 8. `riders` is collected. After every vehicle has ticked, the chase
   *    cameras are synced (ADR 0028, 0071), and water breathing is refreshed
   *    every `SPEC.waterBreathingInterval` ticks (ADR 0040).
   * 9. `impulse` and `yaw`, only when there is no `dock`: a docked vehicle is
   *    held instead of moved (ADR 0063).
   * 10. `seatLayout`: for a kind whose players choose their seat, the
   *    vehicle's riders are laid in this order, with a seat filler for each
   *    undefined entry, so each player sits in their seat (ADR 0120).
   * 11. `boardDeckRiders`: the deck-seat riders move into the vehicle
   *    (ADR 0063), before standing players are seated (ADR 0068).
   * 12. `depart`: take any deck-seat rider the vehicle refused off their deck
   *    seat, then seat them and the standing players, nearest first, and move
   *    those left without a seat to the exit (ADR 0068, 0095).
   * 13. `dock.seats` at `yaw`, after boarding and departure; with no `dock`,
   *    the deck seats are removed.
   * 14. `standIn`: the vehicle's one stand-in entity is kept at this pose, or
   *     removed when there is none (ADR 0116).
   * 15. `dock.cells`; with no `dock`, the laid cells are cleared.
   * 16. Headlight cells along the vehicle's heading after this tick, or none
   *     when its headlights are off (ADR 0020).
   * 17. `hits`, credited to `driverId`.
   * 18. `finalCommands`: the vacated seats' commands, such as the door
   *     animation, then the taken seats' commands (ADR 0007, 0055).
   * 19. `exits`, after `finalCommands`: each player who left a seat with an exit this tick
   *     is moved there, unless the world's guard keeps the engine's dismount spot (ADR 0109, 0141).
   */
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
        testHeld: snap.testHeld,
        location: snap.location,
        velocity: snap.velocity,
        onGround: snap.onGround,
        waterAt: (offset) => this.world.waterAt(snap.id, offset),
        lavaAt: (offset) => this.world.lavaAt(snap.id, offset),
        solidAt: (offset) => this.world.solidAt(snap.id, offset),
        blockTypes: (cells) => this.world.blockTypes(snap.id, cells),
        ownsLaidBlock: (cell, typeId) =>
          this.world.ownsLaidBlock(snap.id, cell, typeId),
        targets: () => this.world.targetsNear(snap.id),
      });
      // Latches advance while building commands; a failed tick or send must retry every value (ADR 0127).
      this.world.run(snap.id, out.stepCommands);
      for (const command of out.riderPoses) {
        if (command.type === "play")
          this.world.play(command.playerId, command.pose);
        else this.world.clear(command.playerId);
      }
    } catch (error) {
      vehicle.resync();
      throw error;
    }
    if (out.message && out.driverId)
      this.world.showMessage(out.driverId, out.message);
    this.world.holdAt(snap.id, out.dock?.hold);
    if (out.clear.length > 0) this.world.clearBlocks(snap.id, out.clear);
    if (out.cut.length > 0) this.world.cutColumns(snap.id, out.cut);
    if (out.pave !== undefined && out.pave.cells.length > 0)
      this.world.pave(snap.id, out.pave);
    const camera = vehicle.chaseCamera;
    if (out.riders.thirdPerson)
      for (const rider of snap.riders) thirdPersonRiders.set(rider.id, camera);
    if (out.riders.underwater)
      for (const rider of snap.riders) underwater.add(rider.id);
    if (profileOf(snap.kind).ridersFireProof) {
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
    for (const id of gone) {
      this.repo.remove(id);
      this.pendingRelease.add(id);
    }
    for (const id of seen) {
      this.pendingRelease.delete(id);
      this.warnedRelease.delete(id);
    }
    // One failed release must not skip the other vehicles.
    forEachIsolated(
      this.pendingRelease,
      (id) => {
        try {
          this.world.releaseVehicle(id);
        } catch (error) {
          // Rethrowing lets forEachIsolated log it; every retry after that stays silent.
          if (this.warnedRelease.has(id)) return;
          this.warnedRelease.add(id);
          throw error;
        }
        this.pendingRelease.delete(id);
        this.warnedRelease.delete(id);
      },
      this.log,
      (id) => id,
    );
  }
}
