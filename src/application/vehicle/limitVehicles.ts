// Use case: remove the oldest vehicles over each owner and kind limit (ADR 0066).
import type { Fleet, FleetEntry } from "../../domain/vehicle/fleet";
import type { FleetRepository } from "../../domain/vehicle/fleetRepository";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import { forEachIsolated } from "./isolated";
import type { LimitWorld, Logger } from "./ports";
import { retireVehicle } from "./retireVehicle";

export class LimitVehicles {
  constructor(
    private readonly world: LimitWorld,
    private readonly repo: VehicleRepository,
    private readonly fleets: FleetRepository,
    private readonly log: Logger,
  ) {}

  /** Reads back the vehicles already loaded when the script starts. */
  start(): void {
    this.found(this.world.loadedFleetEntries());
  }

  /**
   * A vehicle was just created, from the item or a command. Removes the loaded
   * vehicles this or an earlier eviction pushed out.
   */
  spawned(entry: FleetEntry): void {
    const fleet = this.fleets.load();
    fleet.admit(entry);
    this.removeLoadedEvicted(fleet);
    this.fleets.save(fleet);
  }

  /**
   * Vehicles read back from the world: a chunk loaded, or the script started.
   * One the fleet never saw spawn was there before the limit existed, so it
   * counts as older than every vehicle the fleet saw spawn.
   */
  found(entries: readonly FleetEntry[]): void {
    const fleet = this.fleets.load();
    let changed = false;
    for (const entry of entries) {
      if (fleet.knows(entry.id)) continue;
      fleet.admitAsOldest(entry);
      changed = true;
    }
    if (this.removeLoadedEvicted(fleet) || changed) this.fleets.save(fleet);
  }

  private removeLoadedEvicted(fleet: Fleet): boolean {
    let removed = false;
    // One failure must not cost the others, or the save of the fleet.
    forEachIsolated(
      this.world.loadedFleetEntries(),
      ({ id }) => {
        if (!fleet.isEvicted(id)) return;
        retireVehicle(this.world, this.repo, fleet, id);
        removed = true;
        this.log.warn(`${id}: removed, over the limit`);
      },
      this.log,
      ({ id }) => id,
    );
    return removed;
  }
}
